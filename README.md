<p align="center">
    <a href="https://www.npmjs.com/package/@google-cloud/cloud-sql-connector">
        <img src="https://raw.githubusercontent.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/main/docs/images/cloud-sql-nodejs-connector.png" alt="cloud-sql-nodejs-connector image">
    </a>
</p>

<h1 align="center">Cloud SQL Node.js Connector</h1>

[![CI][ci-badge]][ci-build]
[![npm][npm-badge]][npm-docs]

[ci-badge]: https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/actions/workflows/tests.yml/badge.svg?event=push
[ci-build]: https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/actions/workflows/tests.yml?query=event%3Apush+branch%3Amain
[npm-badge]: https://img.shields.io/npm/v/@google-cloud/cloud-sql-connector
[npm-docs]: https://www.npmjs.com/package/@google-cloud/cloud-sql-connector

The **Cloud SQL Node.js Connector** is a Cloud SQL connector designed for use
with the Node.js runtime. Using a Cloud SQL connector provides the following
benefits:
- **IAM Authorization:** uses IAM permissions to control who/what can connect to
your Cloud SQL instances
- **Improved Security:** uses robust, updated TLS 1.3 encryption and identity
verification between the client connector and the server-side proxy,
independent of the database protocol.
- **Convenience:** removes the requirement to use and distribute SSL
certificates, as well as manage firewalls or source/destination IP addresses.

The Cloud SQL Node.js Connector is a package to be used alongside a database
driver. Currently supported drivers are:

- [`pg`](https://www.npmjs.com/package/pg) (PostgreSQL)
- [`mysql2`](https://www.npmjs.com/package/mysql2) (MySQL)
- [`tedious`](https://www.npmjs.com/package/tedious) (SQL Server)

## Installation

You can install the library using `npm install`:

```sh
npm install @google-cloud/cloud-sql-connector
```

## Usage

The connector package is meant to be used alongside a database driver, in the
following examples you can see how to create a new connector and get valid
options that can then be used when starting a new connection.

### Using with PostgreSQL

Here is how to start a new
[`pg`](https://www.npmjs.com/package/pg) connection pool.

```js
import pg from 'pg';
import {Connector} from '@google-cloud/cloud-sql-connector';
const {Pool} = pg;

const connector = new Connector();
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  ipType: 'PUBLIC', 
});
const pool = new Pool({
  ...clientOpts,
  user: 'my-user',
  password: 'my-password',
  database: 'db-name',
  max: 5
});
const {rows} = await pool.query('SELECT NOW()');
console.table(rows); // prints returned time value from server

await pool.end();
connector.close();
```

### Automatic IAM Authentication with Postgres
```js
import pg from 'pg';
import {Connector} from '@google-cloud/cloud-sql-connector';
const {Pool} = pg;

const connector = new Connector();
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  ipType: 'PUBLIC', 
  authType: 'IAM'
});
const pool = new Pool({
  ...clientOpts,
  user: 'my-user@project-id.iam',
  database: 'db-name',
  max: 5
});
const {rows} = await pool.query('SELECT NOW()');
console.table(rows); // prints returned time value from server

await pool.end();
connector.close();
```

### Using with MySQL

Here is how to start a new
[`mysql2`](https://www.npmjs.com/package/mysql2) connection pool.

```js
import mysql from 'mysql2/promise';
import {Connector} from '@google-cloud/cloud-sql-connector';

const connector = new Connector();
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  ipType: 'PUBLIC',
});
const pool = await mysql.createPool({
  ...clientOpts,
  user: 'my-user',
  password: 'my-password',
  database: 'db-name',
});
const conn = await pool.getConnection();
const [result] = await conn.query( `SELECT NOW();`);
console.table(result); // prints returned time value from server

await pool.end();
connector.close();
```

### Automatic IAM Authentication with MySQL

```js
import mysql from 'mysql2/promise';
import {Connector} from '@google-cloud/cloud-sql-connector';

const connector = new Connector();
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  ipType: 'PUBLIC',
  authType: 'IAM'
});
const pool = await mysql.createPool({
  ...clientOpts,
  user: 'my-user',
  database: 'db-name',
});
const conn = await pool.getConnection();
const [result] = await conn.query( `SELECT NOW();`);
console.table(result); // prints returned time value from server

await pool.end();
connector.close();
```

### Specifying Public or Private IP

The Cloud SQL Connector for Node.js can be used to connect to Cloud SQL instances
using both public and private IP addresses. Specifying which IP address type to
connect to can be configured within `getOptions` through the `ipType` argument.

By default, connections will be configured to `'PUBLIC'` and connect over
public IP, to configure connections to use an instance's private IP,
use `'PRIVATE'` for `ipType` as follows:

```js
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  ipType: 'PRIVATE',
});
```

### Using with SQL Server

Here is how to start a new
[`tedious`](https://www.npmjs.com/package/tedious) connection.

```js
const {Connection, Request} = require('tedious');
const {Connector} = require('@google-cloud/cloud-sql-connector');

const connector = new Connector();
const clientOpts = await connector.getTediousOptions({
  instanceConnectionName: process.env.SQLSERVER_CONNECTION_NAME,
  ipType: 'PUBLIC'
});
const connection = new Connection({
  // Please note that the `server` property here is not used and is only defined
  // due to a bug in the tedious driver (ref: https://github.com/tediousjs/tedious/issues/1541)
  // With that in mind, do not try to change this value since it will have no
  // impact in how the connector works, this README will be updated to remove
  // this property declaration as soon as the tedious driver bug is fixed
  server: '0.0.0.0',
  authentication: {
    type: 'default',
    options: {
      userName: 'my-user',
      password: 'my-password',
    },
  },
  options: {
    ...clientOpts,
    // Please note that the `port` property here is not used and is only defined
    // due to a bug in the tedious driver (ref: https://github.com/tediousjs/tedious/issues/1541)
    // With that in mind, do not try to change this value since it will have no
    // impact in how the connector works, this README will be updated to remove
    // this property declaration as soon as the tedious driver bug is fixed
    port: 9999,
    database: 'my-database',
  },
})

connection.connect(err => {
  if (err) { throw err; }
  let result;
  const req = new Request('SELECT GETUTCDATE()', (err) => {
    if (err) { throw err; }
  })
  req.on('error', (err) => { throw err; });
  req.on('row', (columns) => { result = columns; });
  req.on('requestCompleted', () => {
    console.table(result);
  });
  connection.execSql(req);
})

connection.close();
connector.close();
```

## Supported Node.js Versions

Our client libraries follow the
[Node.js release schedule](https://nodejs.org/en/about/releases/).
Libraries are compatible with all current _active_ and _maintenance_ versions
of Node.js.
If you are using an end-of-life version of Node.js, we recommend that you
update as soon as possible to an actively supported LTS version.

Google's client libraries support legacy versions of Node.js runtimes on a
best-efforts basis with the following warnings:

* Legacy versions are not tested in continuous integration.
* Some security patches and features cannot be backported.
* Dependencies cannot be kept up-to-date.

## Versioning

This library follows [Semantic Versioning](http://semver.org/).

This library is considered to be at **preview**, ready for testing by customers.

More Information:
[Google Cloud Platform Launch Stages](https://cloud.google.com/terms/launch-stages)

## Contributing

Contributions welcome! See the [Contributing Guide](./docs/contributing.md).

## License

Apache Version 2.0

See [LICENSE](./LICENSE)
