<p align="center">
    <a href="https://www.npmjs.com/package/@google-cloud/cloud-sql-connector">
        <img src="https://raw.githubusercontent.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/main/docs/images/cloud-sql-nodejs-connector.png" alt="cloud-sql-nodejs-connector image">
    </a>
</p>

<h1 align="center">Cloud SQL Node.js Connector</h1>

[![CI][ci-badge]][ci-build]
[![npm][npm-badge]][npm-docs]
[![npm][npm-downloads]][npm-docs]

[ci-badge]: https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/actions/workflows/tests.yml/badge.svg?event=push
[ci-build]: https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/actions/workflows/tests.yml?query=event%3Apush+branch%3Amain
[npm-badge]: https://img.shields.io/npm/v/@google-cloud/cloud-sql-connector
[npm-docs]: https://www.npmjs.com/package/@google-cloud/cloud-sql-connector
[npm-downloads]: https://img.shields.io/npm/dm/@google-cloud/cloud-sql-connector

The **Cloud SQL Node.js Connector** is a Cloud SQL connector designed for use
with the Node.js runtime. Using a Cloud SQL connector provides a native
alternative to the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/mysql/sql-proxy)
while providing the following benefits:

- **IAM Authorization:** uses IAM permissions to control who/what can connect to
  your Cloud SQL instances
- **Improved Security:** uses robust, updated TLS 1.3 encryption and identity
  verification between the client connector and the server-side proxy,
  independent of the database protocol.
- **Convenience:** removes the requirement to use and distribute SSL
  certificates, as well as manage firewalls or source/destination IP addresses.
- (optionally) **IAM DB Authentication:** provides support for
  [Cloud SQL’s automatic IAM DB AuthN][iam-db-authn] feature.

[iam-db-authn]: https://cloud.google.com/sql/docs/postgres/authentication

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

### APIs and Services

This library requires the following to successfully make Cloud SQL Connections:

- IAM principal (user, service account, etc.) with the
[Cloud SQL Client][client-role] role. This IAM principal will be used for
[credentials](#credentials).
- The [Cloud SQL Admin API][admin-api] to be enabled within your Google Cloud
Project. By default, the API will be called in the project associated with
the IAM principal.

[admin-api]: https://console.cloud.google.com/apis/api/sqladmin.googleapis.com
[client-role]: https://cloud.google.com/sql/docs/mysql/roles-and-permissions

### Credentials

This library uses the [Application Default Credentials (ADC)][adc] strategy for
resolving credentials. Please see [these instructions for how to set your ADC][set-adc]
(Google Cloud Application vs Local Development, IAM user vs service account credentials),
or consult the [Node.js google-auth-library][google-auth].

[adc]: https://cloud.google.com/docs/authentication#adc
[set-adc]: https://cloud.google.com/docs/authentication/provide-credentials-adc
[google-auth]: https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest#ways-to-authenticate

## Usage

The connector package is meant to be used alongside a database driver, in the
following examples you can see how to create a new connector and get valid
options that can then be used when starting a new connection.

For even more examples, check the [`examples/`](examples/) folder.

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
  max: 5,
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
const [result] = await conn.query(`SELECT NOW();`);
console.table(result); // prints returned time value from server

await pool.end();
connector.close();
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
  ipType: 'PUBLIC',
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
});

connection.connect(err => {
  if (err) {
    throw err;
  }
  let result;
  const req = new Request('SELECT GETUTCDATE()', err => {
    if (err) {
      throw err;
    }
  });
  req.on('error', err => {
    throw err;
  });
  req.on('row', columns => {
    result = columns;
  });
  req.on('requestCompleted', () => {
    console.table(result);
  });
  connection.execSql(req);
});

connection.close();
connector.close();
```

### Using a Local Proxy Tunnel (Unix domain socket)

Another possible way to use the Cloud SQL Node.js Connector is by creating a
local proxy server that tunnels to the secured connection established
using the `Connector.startLocalProxy()` method instead of
`Connector.getOptions()`.

> [!NOTE]
>
> The `startLocalProxy()` method is currently only supported for MySQL and PostgreSQL
> as it uses a Unix domain socket which SQL Server does not currently support.

This alternative approach enables usage of the Connector library with
unsupported drivers such as [Prisma](https://www.prisma.io/). Here is an
example on how to use it with its PostgreSQL driver:

```js
import {Connector} from '@google-cloud/cloud-sql-connector';
import {PrismaClient} from '@prisma/client';

const connector = new Connector();
await connector.startLocalProxy({
  instanceConnectionName: 'my-project:us-east1:my-instance',
  listenOptions: { path: '.s.PGSQL.5432' },
});
const hostPath = process.cwd();

const datasourceUrl =
 `postgresql://my-user:password@localhost/dbName?host=${hostPath}`;
const prisma = new PrismaClient({ datasourceUrl });

connector.close();
await prisma.$disconnect();
```

For examples on each of the supported Cloud SQL databases consult our
[Prisma samples](./examples/README.md#prisma).

### Specifying IP Address Type

The Cloud SQL Connector for Node.js can be used to connect to Cloud SQL
instances using both public and private IP addresses, as well as
[Private Service Connect](https://cloud.google.com/vpc/docs/private-service-connect)
(PSC). Specifying which IP address type to connect to can be configured within
`getOptions` through the `ipType` argument.

By default, connections will be configured to `'PUBLIC'` and connect over
public IP, to configure connections to use an instance's private IP,
use `'PRIVATE'` for `ipType` as follows:

**Note:** If specifying Private IP or Private Service Connect, your application
must be attached to the proper VPC network to connect to your Cloud SQL
instance. For most applications this will require the use of a
[VPC Connector](https://cloud.google.com/vpc/docs/configure-serverless-vpc-access#create-connector).

#### Example on how to use a Private IP

```js
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  ipType: 'PRIVATE',
});
```

#### Example on how to use a [Private Service Connect](https://cloud.google.com/vpc/docs/private-service-connect) (PSC) IP

```js
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  ipType: 'PSC',
});
```

#### Example on how to use `IpAddressTypes` in TypeScript

```js
import {Connector, IpAddressTypes} from '@google-cloud/cloud-sql-connector';
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  ipType: IpAddressTypes.PSC,
});
```

### Automatic IAM Database Authentication

Connections using [Automatic IAM database authentication][] are supported when
using Postgres or MySQL drivers.

Make sure to [configure your Cloud SQL Instance to allow IAM authentication][configure-iam-authn]
and [add an IAM database user][add-iam-user].

A `Connector` can be configured to connect to a Cloud SQL instance using
automatic IAM database authentication with `getOptions` through the
`authType` argument.

```js
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  authType: 'IAM',
});
```

When configuring a connection for IAM authentication, the `password` argument
can be omitted and the `user` argument should be formatted as follows:

> Postgres: For an IAM user account, this is the user's email address.
> For a service account, it is the service account's email without the
> `.gserviceaccount.com` domain suffix.
>
> MySQL: For an IAM user account, this is the user's email address, without
> the `@` or domain name. For example, for `test-user@gmail.com`, set the
> `user` field to `test-user`. For a service account, this is the service
> account's email address without the `@project-id.iam.gserviceaccount.com`
> suffix.

Examples using the `test-sa@test-project.iam.gserviceaccount.com`
service account to connect can be found below.

[Automatic IAM database authentication]: https://cloud.google.com/sql/docs/postgres/authentication#automatic
[configure-iam-authn]: https://cloud.google.com/sql/docs/postgres/create-edit-iam-instances#configure-iam-db-instance
[add-iam-user]: https://cloud.google.com/sql/docs/postgres/create-manage-iam-users#creating-a-database-user

#### Postgres Automatic IAM Authentication Example

```js
import pg from 'pg';
import {Connector} from '@google-cloud/cloud-sql-connector';
const {Pool} = pg;

const connector = new Connector();
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  authType: 'IAM',
});
const pool = new Pool({
  ...clientOpts,
  user: 'test-sa@test-project.iam',
  database: 'db-name',
  max: 5,
});
const {rows} = await pool.query('SELECT NOW()');
console.table(rows); // prints returned time value from server

await pool.end();
connector.close();
```

#### MySQL Automatic IAM Authentication Example

```js
import mysql from 'mysql2/promise';
import {Connector} from '@google-cloud/cloud-sql-connector';

const connector = new Connector();
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  authType: 'IAM',
});
const pool = await mysql.createPool({
  ...clientOpts,
  user: 'test-sa',
  database: 'db-name',
});
const conn = await pool.getConnection();
const [result] = await conn.query(`SELECT NOW();`);
console.table(result); // prints returned time value from server

await pool.end();
connector.close();
```

#### Example on how to use `AuthTypes` in TypeScript

For TypeScript users, the `AuthTypes` type can be imported and used directly
for automatic IAM database authentication.

```js
import {AuthTypes, Connector} from '@google-cloud/cloud-sql-connector';
const clientOpts = await connector.getOptions({
  instanceConnectionName: 'my-project:region:my-instance',
  authType: AuthTypes.IAM,
});
```

## Using With `Google Auth Library: Node.js Client` Credentials

One can use [`google-auth-library`](https://github.com/googleapis/google-auth-library-nodejs/) credentials
with this library by providing an `AuthClient` or `GoogleAuth` instance to the `Connector`.

```sh
npm install google-auth-library
```

```js
import {GoogleAuth} from 'google-auth-library';
import {Connector} from '@google-cloud/cloud-sql-connector';

const connector = new Connector({
  auth: new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/sqlservice.admin']
  }),
});
```

This can be useful when configuring credentials that differ from
Application Default Credentials. See the [documentation][google-auth-creds]
on the `google-auth-library` for more information.

### Setting a custom quota project

The custom **Google Auth Library** `auth` property can also be used to set
auth-specific properties such as a custom quota project. Following up from the
previous example, here's how you can set a custom quota project using a custom
`auth` credential:

```js
import {GoogleAuth} from 'google-auth-library';
import {Connector} from '@google-cloud/cloud-sql-connector';

const connector = new Connector({
  auth: new GoogleAuth({
    clientOptions: {
      quotaProjectId: '<custom quota project>',
    },
  }),
});
```

## Additional customization via Environment Variables

It is possible to change some of the library default behavior via environment
variables. Here is a quick reference to supported values and their effect:

- `GOOGLE_APPLICATION_CREDENTIALS`: If defined the connector will use this
  file as a custom credential files to authenticate to Cloud SQL APIs. Should be
  a path to a JSON file. You can
  [find more on how to get a valid credentials file here][credentials-json-file].
- `GOOGLE_CLOUD_QUOTA_PROJECT`: Used to set a custom quota project to Cloud SQL
  APIs when defined.

## Using DNS domain names to identify instances

The connector can be configured to use DNS to look up an instance. This would
allow you to configure your application to connect to a database instance, and
centrally configure which instance in your DNS zone.

### Configure your DNS Records

Add a DNS TXT record for the Cloud SQL instance to a **private** DNS server
or a private Google Cloud DNS Zone used by your application.

**Note:** You are strongly discouraged from adding DNS records for your
Cloud SQL instances to a public DNS server. This would allow anyone on the
internet to discover the Cloud SQL instance name.

For example: suppose you wanted to use the domain name
`prod-db.mycompany.example.com` to connect to your database instance
`my-project:region:my-instance`. You would create the following DNS record:

- Record type: `TXT`
- Name: `prod-db.mycompany.example.com` – This is the domain name used by the application
- Value: `my-project:region:my-instance` – This is the instance name

### Configure the connector

Configure the connector as described above, replacing the connector ID with
the DNS name.

Adapting the MySQL + database/sql example above:

```js
import mysql from 'mysql2/promise';
import {Connector} from '@google-cloud/cloud-sql-connector';

const connector = new Connector();
const clientOpts = await connector.getOptions({
  domainName: 'prod-db.mycompany.example.com',
  ipType: 'PUBLIC',
});

const pool = await mysql.createPool({
  ...clientOpts,
  user: 'my-user',
  password: 'my-password',
  database: 'db-name',
});
const conn = await pool.getConnection();
const [result] = await conn.query(`SELECT NOW();`);
console.table(result); // prints returned time value from server

await pool.end();
connector.close();
```

## Automatic failover using DNS domain names

For example: suppose application is configured to connect using the
domain name `prod-db.mycompany.example.com`. Initially the private DNS
zone has a TXT record with the value `my-project:region:my-instance`. The
application establishes connections to the `my-project:region:my-instance`
Cloud SQL instance. Configure the connector using the `domainName` option:

Then, to reconfigure the application to use a different database
instance, change the value of the `prod-db.mycompany.example.com` DNS record
from `my-project:region:my-instance` to `my-project:other-region:my-instance-2`

The connector inside the application detects the change to this
DNS record. Now, when the application connects to its database using the
domain name `prod-db.mycompany.example.com`, it will connect to the
`my-project:other-region:my-instance-2` Cloud SQL instance.

The connector will automatically close all existing connections to
`my-project:region:my-instance`. This will force the connection pools to
establish new connections. Also, it may cause database queries in progress
to fail.

The connector will poll for changes to the DNS name every 30 seconds by default.
You may configure the frequency of the connections using the Connector's
`failoverPeriod` option. When this is set to 0, the connector will disable
polling and only check if the DNS record changed when it is creating a new 
connection.

## Support policy

### Major version lifecycle

This project uses [semantic versioning](https://semver.org/), and uses the
following lifecycle regarding support for a major version:

**Active** - Active versions get all new features and security fixes (that
wouldn’t otherwise introduce a breaking change). New major versions are
guaranteed to be "active" for a minimum of 1 year.

**Deprecated** - Deprecated versions continue to receive security and critical
bug fixes, but do not receive new features. Deprecated versions will be
supported for 1 year.

**Unsupported** - Any major version that has been deprecated for >=1 year is
considered unsupported.

### Supported Node.js Versions

Our client libraries follow the
[Node.js release schedule](https://nodejs.org/en/about/releases/).
Libraries are compatible with all current _active_ and _maintenance_ versions
of Node.js.
If you are using an end-of-life version of Node.js, we recommend that you
update as soon as possible to an actively supported LTS version.

Google's client libraries support legacy versions of Node.js runtimes on a
best-efforts basis with the following warnings:

- Legacy versions are not tested in continuous integration.
- Some security patches and features cannot be backported.
- Dependencies cannot be kept up-to-date.

### Release cadence

This project aims for a release on at least a monthly basis. If no new features
or fixes have been added, a new PATCH version with the latest dependencies is
released.

## Contributing

We welcome outside contributions. Please see our
[Contributing Guide](./docs/contributing.md) for details on how best to
contribute.

## License

Apache Version 2.0

See [LICENSE](./LICENSE)

[credentials-json-file]: https://github.com/googleapis/google-cloud-node#download-your-service-account-credentials-json-file
[google-auth-creds]: https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest#loading-credentials-from-environment-variables
