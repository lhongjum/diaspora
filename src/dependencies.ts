import BluebirdType from 'bluebird';
import LoDashType from 'lodash';
import SequentialEventType from 'sequential-event';

export const _: typeof LoDashType = (() => {
	return global._ || require('lodash');
})();

export const SequentialEvent: typeof SequentialEventType = (() => {
	return global.SequentialEvent || require('sequential-event');
})();

export const Promise: typeof BluebirdType = (() => {
	return global.Promise && (global.Promise as any).version
		? global.Promise
		: require('bluebird');
})();