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

import t from 'tap';
import {Connector} from '@google-cloud/cloud-sql-connector';
import {Connection, Request} from 'tedious';

t.test('open connection and run basic sqlserver commands', async t => {
  const connector = new Connector();
  const clientOpts = await connector.getTediousOptions({
    instanceConnectionName: process.env.SQLSERVER_CONNECTION_NAME,
    ipType: process.env.IP_TYPE || 'PUBLIC',
  });
  const connection = new Connection({
    server: '0.0.0.0',
    authentication: {
      type: 'default',
      options: {
        userName: process.env.SQLSERVER_USER,
        password: process.env.SQLSERVER_PASS,
      },
    },
    options: {
      ...clientOpts,
      port: 9999,
      database: process.env.SQLSERVER_DB,
    },
  });

  await new Promise((res, rej) => {
    connection.connect(err => {
      if (err) {
        return rej(err);
      }
      res();
    });
  });

  const res = await new Promise((res, rej) => {
    let result;
    const req = new Request('SELECT GETUTCDATE()', err => {
      if (err) {
        throw err;
      }
    });
    req.on('error', err => {
      rej(err);
    });
    req.on('row', columns => {
      result = columns;
    });
    req.on('requestCompleted', () => {
      res(result);
    });
    connection.execSql(req);
  });

  const [{value: utcDateResult}] = res;
  t.ok(utcDateResult.getTime(), 'should have valid returned date object');

  connection.close();
  connector.close();
});
