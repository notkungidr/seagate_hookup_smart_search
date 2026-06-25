import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:5177/prodline/seagate/hookup/hookup_smart_search/frontend/';

test.describe('Smart Pivot Search - Permission System E2E Testing', () => {

  test.beforeEach(async ({ context, page }) => {
    // 1. Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // 2. Clear local storage and go to page
    await page.goto(APP_URL);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('TC15: Admin login, User creation, Logout, and Viewer restriction checks', async ({ page }) => {
    // 1. Access login portal and Bypass authenticate using 0001
    const usernameInput = page.locator('#input-login-username');
    await expect(usernameInput).toBeVisible();
    await usernameInput.fill('0001');
    await page.locator('#btn-submit-login').click();

    // 2. Confirm logged in as Admin
    await expect(usernameInput).not.toBeVisible();
    
    // Since the Registry Manager dialog automatically opens for Admin, close it.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600); // Wait for Element Plus dialog fade-out animation
    
    const adminPill = page.locator('.admin-pill-indicator');
    await expect(adminPill).toBeVisible();
    await expect(adminPill).toContainText('System Administrator');

    // 4. Click config dropdown
    const configBtn = page.locator('button:has-text("ระบบจัดการ & การตั้งค่า")');
    await expect(configBtn).toBeVisible();
    await configBtn.click();

    // 5. Open User Permission Manager
    const userMenuOpt = page.locator('.el-dropdown-menu__item:visible:has-text("จัดการสิทธิ์พนักงาน")');
    await expect(userMenuOpt).toBeVisible();
    await userMenuOpt.click();

    const userDialog = page.locator('.user-management-dialog');
    await expect(userDialog).toBeVisible();

    // 6. Create Viewer user EN '9999'
    //    EN is now a filterable/allow-create el-select (remote employee search),
    //    not a plain input. Click the select wrapper to focus it, type the value
    //    (which triggers the remote search), then commit via the auto-created
    //    option. fill()+Enter on the raw <input> is unreliable here because the
    //    inner input is not directly actionable until the select is opened.
    const enFormItem = userDialog.locator('.el-form-item', { hasText: 'รหัสพนักงาน' });
    await enFormItem.locator('.el-select').click();
    await page.keyboard.type('9999');
    // Wait out the remote employee search so the dropdown leaves its loading
    // state and renders the allow-create option for the typed value.
    await page.waitForTimeout(6000);
    await page.locator('.el-select-dropdown__item:visible', { hasText: /^9999$/ }).first().click();

    await userDialog.locator('input[placeholder*="กรอกชื่อ-นามสกุล"]').fill('Viewer Test');

    // Select role 'Viewer' — target the Role form-item explicitly so we don't
    // collide with the EN el-select (both share .user-inline-form .el-select).
    const roleFormItem = userDialog.locator('.el-form-item', { hasText: 'สิทธิ์การใช้งาน' });
    await roleFormItem.locator('.el-select').click();
    await page.locator('.el-select-dropdown__item:visible:has-text("Viewer")').first().click();

    // Click submit
    await userDialog.locator('button:has-text("เพิ่มผู้ใช้")').click();

    // Wait for the new user to appear in the table
    const tableRow = userDialog.locator('.el-table__row:has-text("9999")');
    await expect(tableRow).toBeVisible();
    await expect(tableRow).toContainText('Viewer Test');
    await expect(tableRow).toContainText('VIEWER');

    // 7. Close User Permission Manager
    await userDialog.locator('button[aria-label="Close this dialog"]').click();
    await expect(userDialog).not.toBeVisible();

    // 8. Logout
    await adminPill.locator('.logout-link-btn').click();
    
    // LoginPanel should return
    await expect(usernameInput).toBeVisible(); 

    // 9. Login as Viewer '9999'
    await usernameInput.fill('9999');
    await page.locator('#btn-submit-login').click();

    // 10. Confirm logged in as Viewer
    await expect(usernameInput).not.toBeVisible();
    const viewerPill = page.locator('.viewer-pill-indicator');
    await expect(viewerPill).toBeVisible();
    await expect(viewerPill).toContainText('Viewer Test');
    await expect(viewerPill).toContainText('Viewer');

    // 11. Verify settings dropdown contains only limited items (no user manager, no registry manager)
    await configBtn.click();
    
    const userManagerOpt = page.locator('.el-dropdown-menu__item:visible:has-text("จัดการสิทธิ์พนักงาน")');
    const registryManagerOpt = page.locator('.el-dropdown-menu__item:visible:has-text("จัดการ Chains & Tables")');
    
    await expect(userManagerOpt).not.toBeVisible();
    await expect(registryManagerOpt).not.toBeVisible();

    // 12. Verify that Table Selection and Raw Data Search is hidden
    const mainTableSelect = page.locator('#select-master-table');
    await expect(mainTableSelect).not.toBeVisible();

    const mainSearchBtn = page.locator('#btn-main-search');
    await expect(mainSearchBtn).not.toBeVisible();

    // 13. Verify API Endpoints Manager is also hidden from Viewer
    const apiManagerOpt = page.locator('.el-dropdown-menu__item:visible:has-text("จัดการ API Endpoints")');
    await expect(apiManagerOpt).not.toBeVisible();
  });

});
