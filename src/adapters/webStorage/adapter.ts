import * as _ from 'lodash';

import {
	Adapter,
	EAdapterState,
	IRemapsHash,
	IFiltersHash,
	QueryLanguage,
} from '../base';
import { IRawEntityAttributes, EntityUid } from '../../entityFactory';
import { WebStorageEntity } from '.';
import * as Utils from '../../utils';

export interface IWebStorageAdapterConfig {
	/**
	 * @param config - Set to true to use sessionStorage instead of localStorage.
	 */
	session: boolean;
}

/**
 * This class is used to use local storage or session storage as a data store. This adapter should be used only by the browser.
 */
export class WebStorageAdapter extends Adapter<WebStorageEntity> {
	/**
	 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Storage Storage api} where to store data.
	 *
	 * @author Gerkin
	 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage localStorage} and {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage sessionStorage} on MDN web docs.
	 * @see {@link Adapters.WebStorageDiasporaAdapter}:config.session parameter.
	 */
	private source: Storage;

	/**
	 * Create a new instance of local storage adapter.
	 *
	 * @author gerkin
	 * @param config - Configuration object.
	 */
	constructor(config: IWebStorageAdapterConfig = { session: false }) {
		/**
		 * Link to the WebStorageEntity.
		 *
		 * @name classEntity
		 * @type {DataStoreEntities.WebStorageEntity}
		 * @memberof Adapters.WebStorageDiasporaAdapter
		 * @instance
		 * @author Gerkin
		 */
		super(WebStorageEntity, 'webStorage');
		_.defaults(config, {
			session: false,
		});
		this.state = EAdapterState.READY;
		this.source =
			true === config.session
				? (global as any).sessionStorage
				: (global as any).localStorage;
	}

	/**
	 * Create the collection index and call {@link Adapters.DiasporaAdapter#configureCollection}.
	 *
	 * @author gerkin
	 * @param tableName - Name of the table (usually, model name).
	 * @param remaps    - Associative hash that links entity field names with data source field names.
	 * @returns This function does not return anything.
	 */
	public configureCollection(
		tableName: string,
		remaps: IRemapsHash,
		filters: IFiltersHash
	) {
		super.configureCollection(tableName, remaps);
		this.ensureCollectionExists(tableName);
	}

	// -----
	// ### Utils

	/**
	 * Create the table key if it does not exist.
	 *
	 * @author gerkin
	 * @param   table - Name of the table.
	 * @returns Index of the collection.
	 */
	private ensureCollectionExists(table: string) {
		const index = this.source.getItem(table);
		if (_.isNil(index)) {
			const newIndex: string[] = [];
			this.source.setItem(table, JSON.stringify(newIndex));
			return newIndex;
		} else {
			return JSON.parse(index) as string[];
		}
	}

	/**
	 * Deduce the item name from table name and item ID.
	 *
	 * @author gerkin
	 * @param   table - Name of the table to construct name for.
	 * @param   id    - Id of the item to find.
	 * @returns Name of the item.
	 */
	private static getItemName(table: string, id: EntityUid): string {
		return `${table}.id=${id}`;
	}

	// -----
	// ### Insert

	/**
	 * Insert a single entity in the local storage.
	 *
	 * @summary This reimplements {@link Adapters.DiasporaAdapter#insertOne}, modified for local storage or session storage interactions.
	 * @author gerkin
	 * @param   table  - Name of the table to insert data in.
	 * @param   entity - Hash representing the entity to insert.
	 * @returns Promise resolved once insertion is done. Called with (*{@link DataStoreEntities.WebStorageEntity}* `entity`).
	 */
	async insertOne(
		table: string,
		entity: IRawEntityAttributes
	): Promise<WebStorageEntity | undefined> {
		entity = _.cloneDeep(entity || {});
		entity.id = Utils.generateUUID();
		this.setIdHash(entity);
		const tableIndex = this.ensureCollectionExists(table);
		tableIndex.push(entity.id);
		this.source.setItem(table, JSON.stringify(tableIndex));
		this.source.setItem(
			WebStorageAdapter.getItemName(table, entity.id),
			JSON.stringify(entity)
		);
		return this.maybeCastEntity(entity);
	}

	/**
	 * Insert several entities in the local storage.
	 *
	 * @summary This reimplements {@link Adapters.DiasporaAdapter#insertMany}, modified for local storage or session storage interactions.
	 * @author gerkin
	 * @param   table    - Name of the table to insert data in.
	 * @param   entities - Array of hashes representing entities to insert.
	 * @returns Promise resolved once insertion is done. Called with (*{@link DataStoreEntities.WebStorageEntity}[]* `entities`).
	 */
	async insertMany(
		table: string,
		entities: IRawEntityAttributes[]
	): Promise<WebStorageEntity[]> {
		entities = _.cloneDeep(entities);
		try {
			const tableIndex = this.ensureCollectionExists(table);
			entities = entities.map((entity = {}) => {
				entity.id = Utils.generateUUID();
				this.setIdHash(entity);
				tableIndex.push(entity.id);
				this.source.setItem(
					WebStorageAdapter.getItemName(table, entity.id),
					JSON.stringify(entity)
				);
				return new this.classEntity(entity, this);
			});
			this.source.setItem(table, JSON.stringify(tableIndex));
		} catch (error) {
			return Promise.reject(error);
		}
		return Promise.resolve(this.maybeCastSet(entities));
	}

	// -----
	// ### Find

	/**
	 * Find a single local storage entity using its id.
	 *
	 * @author gerkin
	 * @param   table - Name of the collection to search entity in.
	 * @param   id    - Id of the entity to search.
	 * @returns Found entity, or undefined if not found.
	 */
	findOneById(table: string, id: string): WebStorageEntity | undefined {
		const item = this.source.getItem(WebStorageAdapter.getItemName(table, id));
		if (!_.isNil(item)) {
			return this.maybeCastEntity(JSON.parse(item));
		}
		return undefined;
	}

	/**
	 * Retrieve a single entity from the local storage.
	 *
	 * @summary This reimplements {@link Adapters.DiasporaAdapter#findOne}, modified for local storage or session storage interactions.
	 * @author gerkin
	 * @param   table     - Name of the model to retrieve data from.
	 * @param   queryFind - Hash representing the entity to find.
	 * @param   options   - Hash of options.
	 * @returns Promise resolved once item is found. Called with (*{@link DataStoreEntities.WebStorageEntity}* `entity`).
	 */
	async findOne(
		table: string,
		queryFind: QueryLanguage.SelectQuery,
		options: QueryLanguage.QueryOptions = this.normalizeOptions()
	): Promise<WebStorageEntity | undefined> {
		_.defaults(options, {
			skip: 0,
		});
		if (!_.isObject(queryFind)) {
			// TODO: Still needed?
			return this.findOneById(table, queryFind as any);
		} else if (
			_.isEqual(_.keys(queryFind), ['id']) &&
			_.isEqual(_.keys(queryFind.id), ['$equal'])
		) {
			return this.findOneById(table, queryFind.id.$equal);
		}
		const items = this.ensureCollectionExists(table);
		let returnedItem;
		let matched = 0;
		_.each(items, itemId => {
			const itemInWebStorage = this.source.getItem(
				WebStorageAdapter.getItemName(table, itemId)
			);
			if (!itemInWebStorage) {
				return true;
			}
			const item = JSON.parse(itemInWebStorage);
			if (this.matchEntity(queryFind, item)) {
				matched++;
				// If we matched enough items
				if (matched > options.skip) {
					returnedItem = item;
					return false;
				}
			}
			return true;
		});
		return this.maybeCastEntity(returnedItem);
	}

	// -----
	// ### Update

	/**
	 * Update a single entity in the memory.
	 *
	 * @summary This reimplements {@link Adapters.DiasporaAdapter#updateOne}, modified for local storage or session storage interactions.
	 * @author gerkin
	 * @param   table     - Name of the table to update data in.
	 * @param   queryFind - Hash representing the entity to find.
	 * @param   update    - Object properties to set.
	 * @param   options   - Hash of options.
	 * @returns Promise resolved once update is done. Called with (*{@link DataStoreEntities.WebStorageEntity}* `entity`).
	 */
	async updateOne(
		table: string,
		queryFind: QueryLanguage.SelectQuery,
		update: IRawEntityAttributes,
		options: QueryLanguage.QueryOptions = this.normalizeOptions()
	): Promise<WebStorageEntity | undefined> {
		_.defaults(options, {
			skip: 0,
		});
		const entity = await this.findOne(table, queryFind, options);

		if (_.isNil(entity)) {
			return undefined;
		}
		Utils.applyUpdateEntity(update, entity);
		this.source.setItem(
			WebStorageAdapter.getItemName(table, entity.id),
			JSON.stringify(entity)
		);
		return entity;
	}

	// -----
	// ### Delete

	/**
	 * Delete a single entity from the local storage.
	 *
	 * @summary This reimplements {@link Adapters.DiasporaAdapter#deleteOne}, modified for local storage or session storage interactions.
	 * @author gerkin
	 * @param   table     - Name of the table to delete data from.
	 * @param   queryFind - Hash representing the entity to find.
	 * @param   options   - Hash of options.
	 * @returns Promise resolved once item is deleted. Called with (*undefined*).
	 */
	async deleteOne(
		table: string,
		queryFind: QueryLanguage.SelectQuery,
		options: QueryLanguage.QueryOptions = this.normalizeOptions()
	): Promise<void> {
		const entityToDelete = await this.findOne(table, queryFind, options);

		if (!entityToDelete) {
			return;
		}
		const tableIndex = this.ensureCollectionExists(table);
		_.pull(tableIndex, entityToDelete.id);
		this.source.setItem(table, JSON.stringify(tableIndex));
		this.source.removeItem(
			WebStorageAdapter.getItemName(table, entityToDelete.id)
		);
	}

	/**
	 * Delete several entities from the local storage.
	 *
	 * @summary This reimplements {@link Adapters.DiasporaAdapter#deleteMany}, modified for local storage or session storage interactions.
	 * @author gerkin
	 * @param   table     - Name of the table to delete data from.
	 * @param   queryFind - Hash representing entities to find.
	 * @param   options   - Hash of options.
	 * @returns Promise resolved once items are deleted. Called with (*undefined*).
	 */
	async deleteMany(
		table: string,
		queryFind: QueryLanguage.SelectQuery,
		options: QueryLanguage.QueryOptions = this.normalizeOptions()
	): Promise<void> {
		const entitiesToDelete = (await this.findMany(
			table,
			queryFind,
			options
		)) as WebStorageEntity[];

		const tableIndex = this.ensureCollectionExists(table);
		_.pullAll(tableIndex, _.map(entitiesToDelete, 'id'));
		this.source.setItem(table, JSON.stringify(tableIndex));
		_.forEach(entitiesToDelete, entityToDelete => {
			this.source.removeItem(
				WebStorageAdapter.getItemName(table, entityToDelete.id)
			);
		});
	}
}