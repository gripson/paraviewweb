import Observable   from '../Observable';
import { debounce } from '../Debounce';

/* eslint-disable no-use-before-define */

const observableInstance = new Observable();
const TOPIC = 'window.size.change';
const domSizes = new WeakMap();
const sizeProperties = ['scrollWidth', 'scrollHeight', 'clientWidth', 'clientHeight'];
const windowListener = debounce(invalidateSize, 250);

let timestamp = 0;
let listenerAttached = false;

// ------ internal functions ------

function updateSize(domElement, cacheObj) {
  if (cacheObj.timestamp < timestamp) {
    sizeProperties.forEach((prop) => {
      cacheObj[prop] = domElement[prop];
    });
    cacheObj.clientRect = domElement.getClientRects()[0];
  }
}

// ------ New API ------

export function getSize(domElement, clearCache = false) {
  var cachedSize = domSizes.get(domElement);
  if (!cachedSize || clearCache) {
    cachedSize = { timestamp: -1 };
    domSizes.set(domElement, cachedSize);
  }
  updateSize(domElement, cachedSize);

  return cachedSize;
}

export function onSizeChange(callback) {
  return observableInstance.on(TOPIC, callback);
}

export function triggerChange() {
  observableInstance.emit(TOPIC);
}

export function isListening() {
  return listenerAttached;
}

export function startListening() {
  if (!listenerAttached) {
    window.addEventListener('resize', windowListener);
    listenerAttached = true;
  }
}

export function stopListening() {
  if (listenerAttached) {
    window.removeEventListener('resize', windowListener);
    listenerAttached = false;
  }
}

// ------ internal functions ------

function invalidateSize() {
  timestamp++;
  triggerChange();
}

// Export
export default {
  getSize,
  isListening,
  onSizeChange,
  startListening,
  stopListening,
  triggerChange,
};