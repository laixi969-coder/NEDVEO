import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

let dev: ViteDevServer;
test.beforeAll(async () => {
  dev = await createServer({
    cacheDir: '.data/e2e-vite-cache',
    server: {
      host: '127.0.0.1', port: 4314, strictPort: true,
      proxy: { '/api': 'http://127.0.0.1:4312' },
    },
  });
  await dev.listen();
});
test.afterAll(async () => { await dev?.close(); });

test('开发模式正确加载双语JSX运行时并保留选项原始值', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  await page.goto('http://127.0.0.1:4314/?view=operations', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '行业覆盖与运行管理', exact: true })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  const role = page.locator('select:has(option[value="独立创业者"])');
  await expect(role).toBeVisible();
  const originalRole = await role.inputValue();
  await page.getByRole('combobox', { name: '界面语言', exact: true }).selectOption('en');
  await expect(role).toHaveValue(originalRole);
  expect(errors).toEqual([]);
});
