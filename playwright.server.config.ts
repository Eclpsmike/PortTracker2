import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'server-workspace.spec.ts',workers:1,reporter:'list',timeout:45000,
  use:{baseURL:'http://127.0.0.1:5189',viewport:{width:1768,height:900}},
  webServer:[
    {command:'API_PORT=3002 APP_ORIGINS=http://127.0.0.1:5189 npm run server',url:'http://127.0.0.1:3002/api/health',reuseExistingServer:false},
    {command:'VITE_STORAGE_MODE=server API_PROXY_TARGET=http://127.0.0.1:3002 npm run dev -- --port 5189',url:'http://127.0.0.1:5189',reuseExistingServer:false}
  ]
});
