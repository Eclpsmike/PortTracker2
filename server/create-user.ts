import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createPool } from './db';
import { configFromEnv } from './config';
import { createUser, type Role } from './auth';
const username=process.argv[2]??'admin',role=(process.argv[3]??'admin') as Role;
const password=process.env.NEW_USER_PASSWORD??randomBytes(24).toString('base64url');
const db=createPool(configFromEnv().databaseUrl);
try{await createUser(db,username,password,role);await writeFile('server/.admin-credentials',`Username: ${username}\nPassword: ${password}\nRole: ${role}\nSign in and use Change password.\n`,{mode:0o600});console.log('User created. Credentials are in server/.admin-credentials (ignored by Git).');}
finally{await db.end();}
