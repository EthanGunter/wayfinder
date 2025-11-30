## Things to consider when performing a Convex migration:
1. Data migration and related logic are commited separately
	- Functions that support the new data structure need to branch with a `// TODO:delete` section that provides a fallback so old data doesn't stop working if used before the migration happens. 
	- The new funcitonality must also be included so that migrated data doesn't revert to an older corrupted state
2. Deletion of columns/tables cannot happen on required data
	- Fields must be converted to v.optional() before the migration, commited, and then in a subsequent commit removed. Convex prevents the database from disagreeing with the schema, and deleting a mandatory field with data in it violates this principal.