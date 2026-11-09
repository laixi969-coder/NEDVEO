import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',use:{baseURL:'http://127.0.0.1:4312',headless:true,channel:'chromium'},webServer:{command:'SHOW_DEMO=1 PORT=4312 VAULT_DIR=.data/e2e-vault DB_PATH=.data/e2e.sqlite NODE_ENV=production node server/index.js',url:'http://127.0.0.1:4312/api/health',reuseExistingServer:false}});
