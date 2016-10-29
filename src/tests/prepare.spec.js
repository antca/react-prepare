const { describe, it } = global;
import t from 'tcomb';
import sinon from 'sinon';
import equal from 'deep-equal';
import React, { PropTypes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import prepared from '../prepared';
import prepare from '../prepare';

describe('prepare', () => {
  it('Shallow hierarchy (no children)', async () => {
    const doAsyncSideEffect = sinon.spy(async () => {});
    const prepareUsingProps = sinon.spy(async ({ text }) => {
      await doAsyncSideEffect(text);
    });
    const App = prepared(prepareUsingProps)(({ text }) => <div>{text}</div>);
    await prepare(<App text='foo' />);
    t.assert(prepareUsingProps.calledOnce, 'prepareUsingProps has been called exactly once');
    t.assert(equal(
      prepareUsingProps.getCall(0).args,
      [{ text: 'foo' }, {}],
    ), 'prepareUsingProps has been called with correct arguments');
    t.assert(doAsyncSideEffect.calledOnce, 'doAsyncSideEffect has been called exactly once');
    t.assert(equal(
      doAsyncSideEffect.getCall(0).args,
      ['foo'],
    ), 'doAsyncSideEffect has been called with correct arguments');
    const html = renderToStaticMarkup(<App text='foo' />);
    t.assert(html === '<div>foo</div>', 'renders with correct html');
  });

  it('Deep hierarchy', async () => {
    let classNameOfFirstChild = 'FirstChild';
    let classNameOfSecondChild = 'SecondChild';
    const doAsyncSideEffectForFirstChild = sinon.spy(async () => {
      classNameOfFirstChild = 'prepared(FirstChild)';
    });
    const prepareUsingPropsForFirstChild = sinon.spy(async ({ text }) => {
      await doAsyncSideEffectForFirstChild(text);
    });
    const doAsyncSideEffectForSecondChild = sinon.spy(async () => {
      classNameOfSecondChild = 'prepared(SecondChild)';
    });
    const prepareUsingPropsForSecondChild = sinon.spy(async ({ text }) => {
      await doAsyncSideEffectForSecondChild(text);
    });

    const FirstChild = prepared(prepareUsingPropsForFirstChild)(({ text }) =>
      <span className={classNameOfFirstChild}>{text}</span>
    );
    const SecondChild = prepared(prepareUsingPropsForSecondChild)(({ text }) =>
      <span className={classNameOfSecondChild}>{text}</span>
    );

    const App = ({ texts }) => <ul>
      <li key={0}><FirstChild text={texts[0]} /></li>
      <li key={1}><SecondChild text={texts[1]} /></li>
    </ul>;
    App.propTypes = {
      texts: PropTypes.array,
    };

    await prepare(<App texts={['first', 'second']} />);

    t.assert(prepareUsingPropsForFirstChild.calledOnce, 'prepareUsingPropsForFirstChild has been called exactly once');
    t.assert(equal(
      prepareUsingPropsForFirstChild.getCall(0).args,
      [{ text: 'first' }, {}],
    ), 'prepareUsingPropsForFirstChild has been called with correct arguments');
    t.assert(doAsyncSideEffectForFirstChild.calledOnce, 'doAsyncSideEffectForFirstChild has been called exactly once');
    t.assert(equal(
      doAsyncSideEffectForFirstChild.getCall(0).args,
      ['first'],
    ), 'doAsyncSideEffectForFirstChild has been called with correct arguments');

    t.assert(prepareUsingPropsForSecondChild.calledOnce, 'prepareUsingPropsForSecondChild has been called exactly once');
    t.assert(equal(
      prepareUsingPropsForSecondChild.getCall(0).args,
      [{ text: 'second' }, {}],
    ), 'prepareUsingPropsForSecondChild has been called with correct arguments');
    t.assert(doAsyncSideEffectForSecondChild.calledOnce, 'doAsyncSideEffectForSecondChild has been called exactly once');
    t.assert(equal(
      doAsyncSideEffectForSecondChild.getCall(0).args,
      ['second'],
    ), 'doAsyncSideEffectForSecondChild has been called with correct arguments');

    const html = renderToStaticMarkup(<App texts={['first', 'second']} />);
    t.assert(html === '<ul><li><span class="prepared(FirstChild)">first</span></li><li><span class="prepared(SecondChild)">second</span></li></ul>'); // eslint-disable-line max-len
  });

  it('context is accessible inside cwm and cwu during prepare even if the constructor is bad', async () => {
    let fooWillMount = null;
    let fooWillUnmount = null;

    class Bar extends React.Component {
      constructor(props) {

        // Oups, no context
        super(props);
      }
      static contextTypes = {
        foo: React.PropTypes.string,
      }
      componentWillMount() {
        fooWillMount = this.context.foo;
      }
      componentWillUnmount() {
        fooWillUnmount = this.context.foo;
      }
      render() {
        return null;
      }
    }

    class Foo extends React.Component {
      static childContextTypes = {
        foo: React.PropTypes.string,
      }
      getChildContext() {
        return { foo: 'foo' };
      }
      render() {
        return <Bar />;
      }
    }

    await prepare(<Foo />);
    t.assert(fooWillMount === 'foo', 'componentWillMount has access to context');
    t.assert(fooWillUnmount === 'foo', 'componentWillUnmount has access to context');
  });

  it('setState is accessible inside componentWillMount', async () => {
    class Foo extends React.Component {
      componentWillMount() {
        this.setState({ bar: 'baz' });
      }
      render() {
        const { bar } = this.state;
        return <div>{bar}</div>;
      }
    }

    let sideEffect = false;
    const PreparedFoo = prepared(() => Promise.resolve().then(() => { sideEffect = true; }))(Foo);
    const preparedFoo = <PreparedFoo />;
    await prepare(preparedFoo);
    t.assert(sideEffect === true, 'The expected side effect happened');
    const html = renderToStaticMarkup(preparedFoo);
    t.assert(html === '<div>baz</div>', 'Render the expected markup');
  });

  it('indirect children have access to the whole context', async () => {
    let bazContext = null;
    class Baz extends React.Component {
      static contextTypes = {
        bar: React.PropTypes.string,
        foo: React.PropTypes.string,
      }
      render() {
        bazContext = this.context;
        return null;
      }
    }

    class Bar extends React.Component {
      static childContextTypes = {
        bar: React.PropTypes.string,
      }
      static contextTypes = {
        foo: React.PropTypes.string,
      }
      getChildContext() {
        return { bar: 'bar' };
      }
      render() {
        return <Baz />;
      }
    }

    class Foo extends React.Component {
      static childContextTypes = {
        foo: React.PropTypes.string,
      }
      getChildContext() {
        return { foo: 'foo' };
      }
      render() {
        return <Bar />;
      }
    }

    await prepare(<Foo />);
    t.assert(equal(bazContext, { foo: 'foo', bar: 'bar' }), 'Baz can access the whole context');
  });

  it('stateless components can access context', async () => {
    let barContext = null;
    function Bar(props, context) {
      barContext = context;
      return null;
    }
    class Foo extends React.Component {
      static childContextTypes = {
        foo: React.PropTypes.string,
      }
      getChildContext() {
        return { foo: 'foo' };
      }
      render() {
        return <Bar />;
      }
    }
    await prepare(<Foo />);
    t.assert(equal(barContext, { foo: 'foo' }), 'Bar can access the context');
  });
});
