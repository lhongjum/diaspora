import * as _ from 'lodash';

import {
	Adapter,
	AdapterEntity,
	IAdapterCtr,
} from './adapters/base';
import { IRawEntityAttributes } from './entities/entityFactory';
import { Model } from './model';
import { logger, ILoggerInterface } from './logger';
import { InMemoryAdapter } from './adapters/inMemory';
import { WebApiAdapter } from './adapters/webApi';
import { WebStorageAdapter } from './adapters/webStorage';
import { ModelDescriptionRaw } from './types/modelDescription';
import { QueryLanguage } from './types/queryLanguage';
import { DataAccessLayer } from './adapters/dataAccessLayer';
import { IDataSourceRegistry, dataSourceRegistry } from './staticStores';

interface IAdapterRegistry {
	[key: string]: IAdapterCtr;
}
interface IModelRegistry {
	[key: string]: Model;
}
interface IRemapIterator {
	( entity: IRawEntityAttributes ): void;
}
interface IQueryTypeDescriptor {
	full: string;
	query: string;
	number: string;
}

/**
 * Diaspora main namespace
 *
 * @author gerkin
 */
export class Diaspora {
	public static get instance() {
		if ( Diaspora._instance ) {
			return Diaspora._instance;
		} else {
			return ( Diaspora._instance = new this() );
		}
	}

	private static _instance: Diaspora;

	private static readonly ERRORS = {
		NON_EMPTY_STR: _.template(
			'<%= c %> <%= p %> must be a non empty string, had "<%= v %>"'
		),
	};

	/**
	 * Logger used by Diaspora and its adapters.
	 *
	 * @author gerkin
	 */
	public get logger() {
		return logger;
	}

	/**
	 * Returns a copy of available data sources. Data sources are adapters already instanciated & registered in Diaspora.
	 *
	 * @author gerkin
	 */
	public get dataSources() {
		return _.assign( {}, this._dataSources );
	}

	/**
	 * Hash containing all available adapters. The only universal adapter is `inMemory`.
	 *
	 * @author gerkin
	 * @see Use {@link Diaspora.registerAdapter} to add adapters.
	 */
	private readonly adapters: IAdapterRegistry = {};

	/**
	 * Hash containing all available data sources.
	 *
	 * @author gerkin
	 * @see Use {@link Diaspora.createNamedDataSource} or {@link Diaspora.registerDataSource} to make data sources available for models.
	 */
	private readonly _dataSources: IDataSourceRegistry = dataSourceRegistry;

	/**
	 * Hash containing all available models.
	 *
	 * @author gerkin
	 * @see Use {@link Diaspora.declareModel} to add models.
	 */
	private readonly models: IModelRegistry = {};

	private static requireName( classname: string, value: any ) {
		if ( !_.isString( value ) && value.length > 0 ) {
			throw new Error(
				Diaspora.ERRORS.NON_EMPTY_STR( {
					c: classname,
					p: 'name',
					v: value,
				} )
			);
		}
	}

	/**
	 * Create a data source (usually, a database connection) that may be used by models.
	 *
	 * @author gerkin
	 * @throws  {Error} Thrown if provided `adapter` label does not correspond to any adapter registered.
	 * @param   adapterLabel - Label of the adapter used to create the data source.
	 * @param   config       - Adapter specific configuration. Check your adapter's doc
	 * @returns New adapter spawned.
	 */
	public createDataSource(
		adapterLabel: string,
		sourceName?: string,
		...config: any[]
	) {
		if ( !this.adapters.hasOwnProperty( adapterLabel ) ) {
			const moduleName = `diaspora-${adapterLabel}`;
			try {
				try {
					require.resolve( moduleName );
				} catch ( e ) {
					throw new Error(
						`Unknown adapter "${adapterLabel}" (expected in module "${moduleName}"). Available currently are ${Object.keys(
							this.adapters
						).join( ', ' )}. Additionnaly, an error was thrown: ${e}`
					);
				}
				require( moduleName );
			} catch ( e ) {
				throw new Error(
					`Could not load adapter "${adapterLabel}" (expected in module "${moduleName}"), an error was thrown: ${e}`
				);
			}
		}
		const adapterCtr = this.adapters[adapterLabel];
		const baseAdapter = new adapterCtr( sourceName || adapterLabel, ...config );
		const newDataSource = new DataAccessLayer( baseAdapter );
		return newDataSource;
	}

	/**
	 * Create a data source (usually, a database connection) that may be used by models.
	 *
	 * @author gerkin
	 * @throws  {Error} Thrown if provided `adapter` label does not correspond to any adapter registered.
	 * @param   sourceName   - Name associated with this datasource.
	 * @param   adapterLabel - Label of the adapter used to create the data source.
	 * @param   configHash   - Configuration hash. This configuration hash depends on the adapter we want to use.
	 * @returns New adapter spawned.
	 */
	public createNamedDataSource(
		sourceName: string,
		adapterLabel: string,
		...otherConfig: any[]
	) {
		Diaspora.requireName( 'DataSource', sourceName );
		const dataSource = this.createDataSource(
			adapterLabel,
			sourceName,
			...otherConfig
		);
		if ( this._dataSources.hasOwnProperty( sourceName ) ) {
			throw new Error( `DataSource name already used, had "${sourceName}"` );
		}
		this._dataSources[sourceName] = dataSource;
		return dataSource;
	}

	/**
	 * Create a new Model with provided description.
	 *
	 * @author gerkin
	 * @throws  {Error} Thrown if parameters are incorrect.
	 * @param   name      - Name associated with this datasource.
	 * @param   modelDesc - Description of the model to define.
	 * @returns Model created.
	 */
	public declareModel( name: string, modelDesc: ModelDescriptionRaw ) {
		if ( _.isString( name ) && name.length > 0 ) {
			Diaspora.requireName( 'Model', name );
		}
		if ( !_.isObject( modelDesc ) ) {
			throw new Error( '"modelDesc" must be an object' );
		}
		const model = new Model( name, modelDesc );
		this.models[name] = model;
		return model;
	}

	/**
	 * Register a new adapter and make it available to use by models.
	 *
	 * @author gerkin
	 * @throws  {Error} Thrown if an adapter already exists with same label.
	 * @throws  {TypeError} Thrown if adapter does not extends {@link Adapters.DiasporaAdapter}.
	 * @param   label   - Label of the adapter to register.
	 * @param   adapter - The adapter to register.
	 * @returns This function does not return anything.
	 */
	public registerAdapter( label: string, adapter: IAdapterCtr ) {
		if ( this.adapters.hasOwnProperty( label ) ) {
			throw new Error( `Adapter with label "${label}" already exists.` );
		}
		// Check inheritance of adapter
		/*if ( !( adapter.prototype instanceof Diaspora.components.Adapters.Adapter )) {
			throw new TypeError( `Trying to register an adapter with label "${ label }", but it does not extends DiasporaAdapter.` );
		}*/
		this.adapters[label] = adapter;
	}
}

const DiasporaInstance = Diaspora.instance;
export default DiasporaInstance;

// Register available built-in adapters
DiasporaInstance.registerAdapter( 'inMemory', InMemoryAdapter );
DiasporaInstance.registerAdapter( 'webApi', WebApiAdapter );
// Register webStorage only if in browser
if ( process.browser ) {
	DiasporaInstance.registerAdapter( 'webStorage', WebStorageAdapter );
}
