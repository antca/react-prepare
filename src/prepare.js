import React from 'react';

import isExtensionOf from './isExtensionOf';
import isThenable from './isThenable';
import { isPrepared, getPrepare } from './prepared';

function createCompositeElementInstance({ type: CompositeComponent, props }, context) {
  const instance = new CompositeComponent(props, context);
  instance.context = context;
  instance.setState = (state) => {
    instance.state = Object.assign({}, instance.state, state);
  };
  if(instance.componentWillMount) {
    instance.componentWillMount();
  }
  return instance;
}

function renderCompositeElementInstance(instance, context = {}) {
  return [
    instance.render(),
    Object.assign({}, context, instance.getChildContext ? instance.getChildContext() : {}),
  ];
}

function disposeOfCompositeElementInstance(instance) {
  if(instance.componentWillUnmount) {
    instance.componentWillUnmount();
  }
}

async function prepareCompositeElement({ type, props }, context) {
  if(isPrepared(type)) {
    const p = getPrepare(type)(props, context);
    if(isThenable(p)) {
      await p;
    }
  }
  let instance = null;
  try {
    instance = createCompositeElementInstance({ type, props }, context);
    return renderCompositeElementInstance(instance, context);
  }
  finally {
    if(instance !== null) {
      disposeOfCompositeElementInstance(instance);
    }
  }
}

async function prepareElement(element, context) {
  if(element === null || typeof element !== 'object') {
    return [null, context];
  }
  const { type, props } = element;
  if(typeof type === 'string') {
    return [props.children, context];
  }
  if(!isExtensionOf(type, React.Component) && !isExtensionOf(type, React.PureComponent)) {
    return [type(props, context), context];
  }
  return await prepareCompositeElement(element, context);
}

async function prepare(element, context = {}) {
  const [children, childContext] = await prepareElement(element, context);
  await Promise.all(React.Children.toArray(children).map((child) => prepare(child, childContext)));
}

export default prepare;
