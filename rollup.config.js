import jscc from 'rollup-plugin-jscc';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
// TODO: Update `rollup-plugin-terser`
// See issue https://github.com/TrySound/rollup-plugin-terser/issues/5 that breaks mutli-output
import { terser } from 'rollup-plugin-terser';
import babel from 'rollup-plugin-babel';
import sourceMaps from 'rollup-plugin-sourcemaps';

import { kebabCase } from 'lodash';

// The module name
const moduleName = 'diaspora';
const fileName = kebabCase(moduleName);

const env = process.env.ENVIRONMENT || 'development'; // Production or development
const pkg = require('./package.json');

console.log(`Building ${moduleName} for ${env}.`);

// Plugins used for build
const getPlugins = browser => [
	// Preprocess files
	jscc( {
		values: {
			_BROWSER: browser,
			_ENVIRONMENT: env,
		},
		extensions: ['.js', '.ts'],
	} ),
	
	// Compile TypeScript files
	typescript( {
		useTsconfigDeclarationDir: true,
		clean: true,
		check: true,
	} ),
	
	json(),
	
	// Allow node_modules resolution, so you can use 'external' to control
	// which external modules to include in the bundle
	// https://github.com/rollup/rollup-plugin-node-resolve#usage
	resolve( {
		browser,
	} ),
	// Allow bundling cjs modules (unlike webpack, rollup doesn't understand cjs)
	commonjs( {
		namedExports: {
			'node_modules/lodash/lodash.js': Object.keys( require( 'lodash' ) ),
		},
	} ),
	
	env === 'production' ? terser() : undefined,
	// Resolve source maps to the original source
	
	// Downgrade ES
	babel(),
	
	sourceMaps(),
].filter(v => v);

// Destination dir
const outDir = 'dist';

// Should we generate source maps?
const sourcemap = true;

const externals = Object.keys(pkg.dependencies).concat(['path']);
const input = './src/index.ts';

export default [
	// Browser
	{
		input,
		output: {
			file: `${outDir}/browser/${fileName}.iife.js`,
			format: 'iife',
			// Use `name` as window to hack a bit & avoid exports.
			name: moduleName,
			sourcemap,
		},
		plugins: getPlugins(true),
	},
	{
		input,
		output: {
			file: `${outDir}/browser/${fileName}.esm.js`,
			format: 'esm',
			name: moduleName,
			sourcemap
		},
		plugins: getPlugins(true),
		external: externals,
	},
	// Node
	{
		input,
		output: {
			file: `${outDir}/node/${fileName}.esm.js`,
			format: 'esm',
			name: moduleName,
			sourcemap
		},
		plugins: getPlugins(false),
		external: externals,
	},
	{
		input,
		output: {
			file: `${outDir}/node/${fileName}.cjs.js`,
			format: 'cjs',
			name: moduleName,
			sourcemap
		},
		plugins: getPlugins(false),
		external: externals,
	},
]
