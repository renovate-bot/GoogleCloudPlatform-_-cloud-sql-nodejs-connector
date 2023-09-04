// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const {Connector} = require('@google-cloud/cloud-sql-connector');
const knex = require('knex');

const main = async () => {
  const connector = new Connector();
  const clientOpts = await connector.getOptions({
    instanceConnectionName: 'my-project:region:my-instance',
    ipType: 'PUBLIC',
    authType: 'IAM',
  });

  const database = knex({
    client: 'mysql2',
    connection: {
      ...clientOpts,
      user: 'my-service-account',
      database: 'my-database',
    },
  });

  const result = await database.first(database.raw('NOW() AS now'));
  console.log(`Current datetime: ${result['now']}`);

  await database.destroy();
  connector.close();
};

main();
