import _ from 'lodash';
import { SequentialEvent } from 'sequential-event';
import Bluebird from 'bluebird';

import { AdapterEntity, QueryLanguage } from '.';
import { Diaspora } from '../../diaspora';
import { IRawEntityAttributes } from '../../entityFactory';
import {
	remapIO,
	OPERATORS,
	CANONICAL_OPERATORS,
	QUERY_OPTIONS_TRANSFORMS,
	iterateLimit,
	IEnumeratedHash,
} from './adapter-utils';

export interface IRemapsHash extends IEnumeratedHash<any> {}
export interface IFiltersHash extends IEnumeratedHash<any> {}

export enum EAdapterState {
	READY = 'ready',
	ERROR = 'error',
	PREPARING = 'preparing',
}
/**
 * Adapter is the base class of adapters. Adapters are components that are in charge to interact with data sources (files, databases, etc etc) with standardized methods. You should not use this class directly: extend this class and re-implement some methods to build an adapter. See the (upcoming) tutorial section.
 * @extends SequentialEvent
 * @memberof Adapters
 * @author gerkin
 */
export abstract class Adapter extends SequentialEvent {
	public get classEntity() {
		return this._classEntity;
	}
	/**
	 * Hash of functions to cast data store values to JSON standard values in entity.
	 *
	 * @property {Function} * - Filter to execute to get standard JSON value.
	 * @author Gerkin
	 */
	protected filters: object;

	/**
	 * Hash to transform entity fields to data store fields.
	 *
	 * @property {string} * - Data store field associated with this entity field.
	 * @author Gerkin
	 */
	protected remaps: object;

	/**
	 * Hash to transform data store fields to entity fields.
	 *
	 * @property {string} * - Entity field associated with this data store field.
	 * @author Gerkin
	 */
	protected remapsInverted: object;

	/**
	 * Error triggered by adapter initialization.
	 *
	 * @type {Error}
	 * @author Gerkin
	 */
	protected error?: Error;

	/**
	 * Describe current adapter status.
	 * @author Gerkin
	 */
	protected state: EAdapterState;

	/**
	 * Link to the constructor of the class generated by this adapter.
	 *
	 * @author Gerkin
	 */

	// -----
	// ### Initialization

	/**
	 * Create a new instance of adapter. This base class should be used by all other adapters.
	 *
	 * @public
	 * @author gerkin
	 * @param classEntity - Entity to spawn with this adapter.
	 */
	constructor(
		protected _classEntity: typeof AdapterEntity,
		public readonly name: string
	) {
		super();
		this.filters = {};
		this.remaps = {};
		this.remapsInverted = {};
		this.error = undefined;
		this.state = EAdapterState.PREPARING;

		// Bind events
		this.on(EAdapterState.READY, () => {
			this.state = EAdapterState.READY;
		}).on(EAdapterState.ERROR, (err: Error) => {
			this.state = EAdapterState.ERROR;
			(Diaspora.logger as any).error(
				'Error while initializing:',
				_.pick(err, Object.getOwnPropertyNames(err))
			);
			this.error = err;
		});
	}

	/**
	 * Saves the remapping table, the reversed remapping table and the filter table in the adapter. Those tables will be used later when manipulating models & entities.
	 *
	 * @author gerkin
	 */
	protected configureCollection(
		tableName: string,
		remaps: IRemapsHash,
		filters: IFiltersHash = {}
	): void {
		(this.remaps as any)[tableName] = {
			normal: remaps,
			inverted: _.invert(remaps),
		};
		(this.filters as any)[tableName] = filters;
	}

	// -----
	// ### Events

	/**
	 * Fired when the adapter is ready to use. You should not try to use the adapter before this event is emitted.
	 *
	 * @event Adapters.Adapter#ready
	 * @type {undefined}
	 * @see {@link Adapters.Adapter#waitReady waitReady} Convinience method to wait for state change.
	 */

	/**
	 * Fired if the adapter failed to initialize or changed to `error` state. Called with the triggering `error`.
	 *
	 * @event Adapters.Adapter#error
	 * @type {Error}
	 * @see {@link Adapters.Adapter#waitReady waitReady} Convinience method to wait for state change.
	 */

	// -----
	// ### Utils

	/**
	 * Returns a promise resolved once adapter state is ready.
	 *
	 * @author gerkin
	 * @listens Adapters.Adapter#error
	 * @listens Adapters.Adapter#ready
	 * @returns {Promise} Promise resolved when adapter is ready, and rejected if an error occured.
	 */
	waitReady(): Bluebird<this> {
		return new Bluebird((resolve, reject) => {
			if (EAdapterState.READY === this.state) {
				return resolve(this);
			} else if (EAdapterState.ERROR === this.state) {
				return reject(this.error);
			}

			this.on(EAdapterState.READY, () => {
				return resolve(this);
			}).on(EAdapterState.ERROR, (err: Error) => {
				return reject(err);
			});
		});
	}

	/**
	 * Cast the provided data to an adapter entity if the data is not nil.
	 */
	maybeCastEntity(data?: object): AdapterEntity<this> | undefined {
		return _.isNil(data) ? undefined : new this.classEntity(data, this);
	}

	/**
	 * Cast the provided array of datas to adapter entities if the data is not nil. Note that {@link Adapters.Nil nil values} aren't filtered out from the resulting array.
	 */
	maybeCastSet(datas?: object[]): Array<AdapterEntity<this>> {
		return _.isNil(datas) ? [] : _.map(datas, this.maybeCastEntity.bind(this));
	}

	/**
	 * TODO.
	 *
	 * @author gerkin
	 * @see TODO remapping.
	 * @see {@link Adapters.Adapter#remapIO remapIO}
	 */
	remapInput(
		tableName: string,
		query: IRawEntityAttributes
	): IRawEntityAttributes {
		return remapIO(this, tableName, query, true);
	}

	/**
	 * TODO.
	 *
	 * @author gerkin
	 * @see TODO remapping.
	 * @see {@link Adapters.Adapter#remapIO remapIO}
	 */
	remapOutput(
		tableName: string,
		query: IRawEntityAttributes
	): IRawEntityAttributes {
		return remapIO(this, tableName, query, false);
	}

	/**
	 * Refresh the `idHash` with current adapter's `id` injected.
	 *
	 * @author gerkin
	 */
	setIdHash(entity: object, propName: string = 'id'): object {
		const entityAny: any = entity as any;
		entityAny.idHash = _.assign({}, entityAny.idHash, {
			[this.name]: entityAny[propName],
		});
		return entity;
	}

	/**
	 * Check if provided `entity` is matched by the query. Query must be in its canonical form before using this function.
	 *
	 * @author gerkin
	 */
	matchEntity(
		query: QueryLanguage.SelectQuery,
		entity: IRawEntityAttributes
	): boolean {
		const matchResult = _.every(_.toPairs(query), ([key, desc]) => {
			if (_.isObject(desc)) {
				const entityVal = (entity as any)[key];
				return _.every(desc, (val, operationName) => {
					const operationFunction = OPERATORS[operationName];
					if (operationFunction) {
						return operationFunction(entityVal, val);
					} else {
						return false;
					}
				});
			}
			return false;
		});
		return matchResult;
	}

	/**
	 * Transform options to their canonical form. This function must be applied before calling adapters' methods.
	 *
	 * @author gerkin
	 * @throws  {TypeError} Thrown if an option does not have an acceptable type.
	 * @throws  {ReferenceError} Thrown if a required option is not present.
	 * @throws  {Error} Thrown when there isn't more precise description of the error is available (eg. when conflicts occurs).
	 * @returns Transformed options (also called `canonical options`).
	 */
	normalizeOptions(
		opts: QueryLanguage.QueryOptionsRaw = {}
	): QueryLanguage.QueryOptions {
		opts = _.cloneDeep(opts);
		_.forEach(QUERY_OPTIONS_TRANSFORMS, (transform, optionName) => {
			if (opts.hasOwnProperty(optionName)) {
				QUERY_OPTIONS_TRANSFORMS[optionName](opts);
			}
		});
		_.defaults(opts, {
			skip: 0,
			remapInput: true,
			remapOutput: true,
		});
		return opts as QueryLanguage.QueryOptions;
	}

	/**
	 * Transform a search query to its canonical form, replacing aliases or shorthands by full query.
	 *
	 * @author gerkin
	 */
	normalizeQuery(
		originalQuery: QueryLanguage.SelectQueryOrCondition,
		options: QueryLanguage.QueryOptions
	): QueryLanguage.SelectQueryOrCondition {
		if (_.isString(originalQuery)) {
			originalQuery = { id: originalQuery };
		}
		const normalizedQuery =
			true === options.remapInput
				? _(_.cloneDeep(originalQuery))
						.mapValues(attrSearch => {
							if (_.isUndefined(attrSearch)) {
								return { $exists: false };
							} else if (!(attrSearch instanceof Object)) {
								return { $equal: attrSearch };
							} else {
								// Replace operations alias by canonical expressions
								attrSearch = _.mapKeys(attrSearch, (val, operator, obj) => {
									if (CANONICAL_OPERATORS.hasOwnProperty(operator)) {
										// ... check for conflict with canonical operation name...
										if (obj.hasOwnProperty(CANONICAL_OPERATORS[operator])) {
											throw new Error(
												`Search can't have both "${operator}" and "${
													CANONICAL_OPERATORS[operator]
												}" keys, as they are synonyms`
											);
										}
										return CANONICAL_OPERATORS[operator];
									}
									return operator;
								});
								// For arithmetic comparison, check if values are numeric (TODO later: support date)
								_.forEach(
									['$less', '$lessEqual', '$greater', '$greaterEqual'],
									operation => {
										if (
											attrSearch.hasOwnProperty(operation) &&
											!(
												_.isNumber(attrSearch[operation]) || _.isDate(attrSearch[operation])
											)
										) {
											throw new TypeError(
												`Expect "${operation}" in ${JSON.stringify(
													attrSearch
												)} to be a numeric value`
											);
										}
									}
								);
								return attrSearch;
							}
						})
						.value()
				: _.cloneDeep(originalQuery);
		return normalizedQuery;
	}

	/**
	 * Returns a POJO representing the current adapter.
	 *
	 * @returns {Object} JSON representation of the adapter.
	 */
	toJSON(): object {
		return _.pick(this, [
			'state',
			'remaps',
			'remapsInverted',
			'classEntity',
			'error',
		]);
	}

	// -----
	// ### Insert

	/**
	 * Insert a single entity in the data store. This function is a default polyfill if the inheriting adapter does not provide `insertOne` itself.
	 *
	 * @summary At least one of {@link insertOne} or {@link insertMany} must be reimplemented by adapter.
	 * @author gerkin
	 */
	async insertOne(
		table: string,
		entity: IRawEntityAttributes
	): Bluebird<AdapterEntity<this> | undefined> {
		return _.first(await this.insertMany(table, [entity]));
	}

	/**
	 * Insert several entities in the data store. This function is a default polyfill if the inheriting adapter does not provide `insertMany` itself.
	 *
	 * @summary At least one of {@link insertOne} or {@link insertMany} must be reimplemented by adapter.
	 * @author gerkin
	 */
	async insertMany(
		table: string,
		entities: IRawEntityAttributes[]
	): Bluebird<AdapterEntity<this>[]> {
		const mapped = await Bluebird.resolve(entities).mapSeries(entity =>
			this.insertOne(table, entity || {})
		);
		return _.compact(mapped);
	}

	// -----
	// ### Find

	/**
	 * Retrieve a single entity from the data store. This function is a default polyfill if the inheriting adapter does not provide `findOne` itself.
	 *
	 * @summary At least one of {@link findOne} or {@link findMany} must be reimplemented by adapter.
	 * @author gerkin
	 */
	async findOne(
		table: string,
		queryFind: QueryLanguage.SelectQuery,
		options: QueryLanguage.QueryOptions = this.normalizeOptions()
	): Bluebird<AdapterEntity<this> | undefined> {
		options.limit = 1;
		return _.first(await this.findMany(table, queryFind, options));
	}

	/**
	 * Retrieve several entities from the data store. This function is a default polyfill if the inheriting adapter does not provide `findMany` itself.
	 *
	 * @summary At least one of {@link findOne} or {@link findMany} must be reimplemented by adapter.
	 * @author gerkin
	 */
	async findMany(
		table: string,
		queryFind: QueryLanguage.SelectQuery,
		options: QueryLanguage.QueryOptions = this.normalizeOptions()
	): Bluebird<AdapterEntity<this>[]> {
		const optionsNormalized = this.normalizeOptions(options);
		const boundQuery = this.findOne.bind(this, table, queryFind);
		return iterateLimit<this>(optionsNormalized, boundQuery);
	}

	// -----
	// ### Update

	/**
	 * Update a single entity from the data store. This function is a default polyfill if the inheriting adapter does not provide `updateOne` itself.
	 *
	 * @summary At least one of {@link updateOne} or {@link updateMany} must be reimplemented by adapter.
	 * @author gerkin
	 */
	async updateOne(
		table: string,
		queryFind: QueryLanguage.SelectQuery,
		update: IRawEntityAttributes,
		options: QueryLanguage.QueryOptions = this.normalizeOptions()
	): Bluebird<AdapterEntity<this> | undefined> {
		options = this.normalizeOptions(options);
		options.limit = 1;
		return _.first(await this.updateMany(table, queryFind, update, options));
	}

	/**
	 * Update several entities from the data store. This function is a default polyfill if the inheriting adapter does not provide `updateMany` itself.
	 *
	 * @summary At least one of {@link updateOne} or {@link updateMany} must be reimplemented by adapter.
	 * @author gerkin
	 */
	async updateMany(
		table: string,
		queryFind: QueryLanguage.SelectQuery,
		update: IRawEntityAttributes,
		options: QueryLanguage.QueryOptions = this.normalizeOptions()
	): Bluebird<AdapterEntity<this>[]> {
		const optionsNormalized = this.normalizeOptions(options);
		return iterateLimit<this>(
			optionsNormalized,
			this.updateOne.bind(this, table, queryFind, update)
		);
	}

	// -----
	// ### Delete

	/**
	 * Delete a single entity from the data store. This function is a default polyfill if the inheriting adapter does not provide `deleteOne` itself.
	 *
	 * @summary At least one of {@link deleteOne} or {@link deleteMany} must be reimplemented by adapter.
	 * @author gerkin
	 */
	async deleteOne(
		table: string,
		queryFind: QueryLanguage.SelectQuery,
		options: QueryLanguage.QueryOptions = this.normalizeOptions()
	): Bluebird<void> {
		options.limit = 1;
		return this.deleteMany(table, queryFind, options);
	}

	/**
	 * Delete several entities from the data store. This function is a default polyfill if the inheriting adapter does not provide `deleteMany` itself.
	 *
	 * @summary At least one of {@link deleteOne} or {@link deleteMany} must be reimplemented by adapter.
	 * @author gerkin
	 * @param   table     - Name of the table to delete data from.
	 * @param   queryFind - Hash representing the entities to find.
	 * @param   options   - Hash of options.
	 * @returns Promise resolved once item is found. Called with (*{@link DataStoreEntity}[]* `entities`).
	 */
	async deleteMany(
		table: string,
		queryFind: QueryLanguage.SelectQuery,
		options: QueryLanguage.QueryOptions = this.normalizeOptions()
	): Bluebird<void> {
		let count = 0;
		// We are going to loop until we find enough items
		const loopFind = (): Bluebird<void> => {
			// First, search for the item.
			return this.findOne(table, queryFind, options).then(found => {
				// If the search returned nothing, then just finish the findMany
				if (_.isNil(found)) {
					return Promise.resolve();
					// Else, if this is a value and not the initial `true`, add it to the list
				}
				// If we found enough items, return them
				if (count === options.limit) {
					return Promise.resolve();
				}
				// Increase our counter
				count++;
				// Do the deletion & loop
				return this.deleteOne(table, queryFind, options).then(loopFind);
			});
		};
		return loopFind();
	}
}
