'use strict';

module.exports = {
	mongo: {
		database: 'diaspora_test',
		username: 'admin',
		//		password: false,
	},
	redis: {
		database: 3,
	},
	localstorage: {
		data_dir: '.localStorageTest',
	},
	webApi: {
		host:   'localhost',
		port:   12345,
		scheme: 'http',
		path:   '/api',
	},
};
