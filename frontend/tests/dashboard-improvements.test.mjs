import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML_PATH = fs.existsSync(path.resolve('public/agriconnect-ui.html'))
    ? path.resolve('public/agriconnect-ui.html')
    : path.resolve('frontend/public/agriconnect-ui.html');
const html = fs.readFileSync(HTML_PATH, 'utf-8');

test('AgriConnect Dashboard Improvements & Bug Fixes Test Suite', async (t) => {

    await t.test('1. Farmer Dashboard Clickable Summary Cards & Accessibility', () => {
        const overviewSection = html.slice(
            html.indexOf('id="fpanel-overview"'),
            html.indexOf('<!-- OVERVIEW CARDS: EXACTLY 6 ESSENTIAL TOOLS -->')
        );
        assert.ok(overviewSection.length > 0, 'Farmer overview section must exist');

        const kpiGrid = overviewSection.slice(
            overviewSection.indexOf('<!-- KPI STATS -->')
        );

        // Card 1: My Crops for Sale -> crops
        assert.ok(
            kpiGrid.includes("onclick=\"openFarmerModule('crops')\""),
            'Farmer Card 1 must navigate to crops'
        );
        assert.ok(
            kpiGrid.includes('id="statFarmerStock"'),
            'Farmer Card 1 must have dynamic ID statFarmerStock'
        );

        // Card 2: Active Delivery Contracts -> contracts
        assert.ok(
            kpiGrid.includes("onclick=\"openFarmerModule('contracts')\""),
            'Farmer Card 2 must navigate to contracts'
        );
        assert.ok(
            kpiGrid.includes('id="statFarmerContracts"'),
            'Farmer Card 2 must have dynamic ID statFarmerContracts'
        );

        // Card 3: Total Crops Supplied & Remaining -> supply-history
        assert.ok(
            kpiGrid.includes("onclick=\"openFarmerModule('supply-history')\""),
            'Farmer Card 3 must navigate to supply-history'
        );
        assert.ok(
            kpiGrid.includes('id="statFarmerSupplied"'),
            'Farmer Card 3 must have dynamic ID statFarmerSupplied'
        );
        assert.ok(
            kpiGrid.includes('id="statFarmerRemaining"'),
            'Farmer Card 3 must have dynamic ID statFarmerRemaining'
        );

        // Card 4: Escrow Payments & Money Received -> payments
        assert.ok(
            kpiGrid.includes("onclick=\"openFarmerModule('payments')\""),
            'Farmer Card 4 must navigate to payments'
        );
        assert.ok(
            kpiGrid.includes('id="statFarmerPayments"'),
            'Farmer Card 4 must have dynamic ID statFarmerPayments'
        );
        assert.ok(
            kpiGrid.includes('id="statFarmerPaymentsSub"'),
            'Farmer Card 4 must have dynamic ID statFarmerPaymentsSub'
        );

        // Accessibility attributes: role="button", tabindex="0", and onkeydown on all 4 cards in kpiGrid
        const expectedModules = ['crops', 'contracts', 'supply-history', 'payments'];
        for (const mod of expectedModules) {
            const cardRegex = new RegExp(`<div[^>]*onclick="openFarmerModule\\('${mod}'\\)"[^>]*>`, 'i');
            const cardMatch = kpiGrid.match(cardRegex);
            assert.ok(cardMatch, `Card div for ${mod} must be present in KPI stats`);
            const cardTag = cardMatch[0];
            assert.ok(cardTag.includes('role="button"'), `Farmer Card ${mod} must include role="button"`);
            assert.ok(cardTag.includes('tabindex="0"'), `Farmer Card ${mod} must include tabindex="0"`);
            assert.ok(cardTag.includes('onkeydown='), `Farmer Card ${mod} must include onkeydown handler`);
            assert.ok(cardTag.includes('cursor-pointer'), `Farmer Card ${mod} must have cursor-pointer affordance`);
        }

        // Dynamic update function exists in JS
        assert.ok(html.includes('function updateFarmerDashboardStats()'), 'updateFarmerDashboardStats function must exist');
    });

    await t.test('2. Buyer Dashboard Clickable Summary Cards & Accessibility', () => {
        const buyerOverviewSection = html.slice(
            html.indexOf('id="bpanel-overview"'),
            html.indexOf('<!-- BUYER TOOLS NAVIGATION -->')
        );
        assert.ok(buyerOverviewSection.length > 0, 'Buyer Overview section must exist');

        // Card 1: Active Contracts -> contracts
        assert.ok(
            buyerOverviewSection.includes("onclick=\"openBuyerModule('contracts')\""),
            'Buyer Card 1 must navigate to contracts'
        );
        assert.ok(
            buyerOverviewSection.includes('id="buyerActiveCount"'),
            'Buyer Card 1 must have dynamic ID buyerActiveCount'
        );

        // Card 2: Pending Deliveries -> contracts
        assert.ok(
            buyerOverviewSection.includes('id="buyerPendingCount"'),
            'Buyer Card 2 must have dynamic ID buyerPendingCount'
        );
        assert.ok(
            buyerOverviewSection.includes('id="buyerPendingSub"'),
            'Buyer Card 2 must have dynamic ID buyerPendingSub'
        );

        // Card 3: Completed Deliveries -> contract-history
        assert.ok(
            buyerOverviewSection.includes("onclick=\"openBuyerModule('contract-history')\""),
            'Buyer Card 3 must navigate to contract-history'
        );
        assert.ok(
            buyerOverviewSection.includes('id="buyerCompletedCount"'),
            'Buyer Card 3 must have dynamic ID buyerCompletedCount'
        );

        // Card 4: Escrow Balance Locked -> contracts
        assert.ok(
            buyerOverviewSection.includes('id="buyerEscrowLocked"'),
            'Buyer Card 4 must have dynamic ID buyerEscrowLocked'
        );
        assert.ok(
            buyerOverviewSection.includes('id="buyerEscrowSub"'),
            'Buyer Card 4 must have dynamic ID buyerEscrowSub'
        );

        // Factual disclaimer: Escrow subtitle states Held for Active Deliveries
        assert.ok(
            buyerOverviewSection.includes('Held for Active Deliveries'),
            'Escrow subtitle must accurately state Held for Active Deliveries'
        );

        // Accessibility attributes: role="button", tabindex="0", and onkeydown on all 4 cards
        const kpiGrid = buyerOverviewSection.slice(
            buyerOverviewSection.indexOf('<!-- KPI METRICS -->'),
            buyerOverviewSection.indexOf('<!-- SECTION: WHAT BUYER NEEDS')
        );
        const cardMatches = kpiGrid.match(/onclick="openBuyerModule\('[^']+'\)"[^>]*>/g) || [];
        assert.equal(cardMatches.length, 4, 'Must find all 4 Buyer summary cards');

        for (const cardTag of cardMatches) {
            assert.ok(cardTag.includes('role="button"'), 'Buyer Card must include role="button"');
            assert.ok(cardTag.includes('tabindex="0"'), 'Buyer Card must include tabindex="0"');
            assert.ok(cardTag.includes('onkeydown='), 'Buyer Card must include keyboard onkeydown handler');
            assert.ok(cardTag.includes('cursor-pointer'), 'Buyer Card must have cursor-pointer affordance');
        }

        // Dynamic update function exists in JS
        assert.ok(html.includes('function updateBuyerDashboardStats()'), 'updateBuyerDashboardStats function must exist');
    });

    await t.test('3. Settings Navigation, Form Inputs, and Profile Update Handlers', () => {
        // Farmer Sidebar has Settings in Group 6
        assert.ok(
            html.includes("onclick=\"openFarmerModule('settings'); toggleSidebarDrawer()\""),
            'Farmer sidebar must contain Settings navigation link'
        );
        assert.ok(html.includes('id="farmerNav-settings"'), 'farmerNav-settings element must exist');

        // Farmer Settings Subpanel exists
        assert.ok(html.includes('id="fpanel-settings"'), 'fpanel-settings subpanel must exist');
        assert.ok(html.includes('id="formFarmerSettings"'), 'formFarmerSettings must exist');
        assert.ok(html.includes('id="settFarmerName"'), 'settFarmerName field must exist');
        assert.ok(html.includes('id="settFarmerPhone"'), 'settFarmerPhone field must exist');
        assert.ok(html.includes('id="settFarmerEmail"'), 'settFarmerEmail field must exist');
        assert.ok(html.includes('id="settFarmerLocation"'), 'settFarmerLocation field must exist');
        assert.ok(html.includes('id="settFarmerPincode"'), 'settFarmerPincode field must exist');
        assert.ok(html.includes('id="settFarmerFarmSize"'), 'settFarmerFarmSize field must exist');
        assert.ok(html.includes('id="settFarmerSoilType"'), 'settFarmerSoilType field must exist');
        assert.ok(html.includes('id="settFarmerIrrigation"'), 'settFarmerIrrigation field must exist');
        assert.ok(html.includes('id="settFarmerPrimaryCrops"'), 'settFarmerPrimaryCrops field must exist');
        assert.ok(html.includes('id="settFarmerAccNumber"'), 'settFarmerAccNumber field must exist');
        assert.ok(html.includes('id="settFarmerIfsc"'), 'settFarmerIfsc field must exist');
        assert.ok(html.includes('id="settFarmerBankName"'), 'settFarmerBankName field must exist');
        assert.ok(html.includes('loadFarmerProfileForEdit()'), 'loadFarmerProfileForEdit function caller must exist');
        assert.ok(html.includes('handleSaveFarmerSettings(event)'), 'handleSaveFarmerSettings submit caller must exist');

        // Buyer Sidebar has Settings in Group 5
        assert.ok(
            html.includes("onclick=\"openBuyerModule('settings'); toggleSidebarDrawer()\""),
            'Buyer sidebar must contain Settings navigation link'
        );
        assert.ok(html.includes('id="buyerNav-settings"'), 'buyerNav-settings element must exist');

        // Buyer Settings Subpanel exists
        assert.ok(html.includes('id="bpanel-settings"'), 'bpanel-settings subpanel must exist');
        assert.ok(html.includes('id="formBuyerSettings"'), 'formBuyerSettings must exist');
        assert.ok(html.includes('id="settBuyerCompany"'), 'settBuyerCompany field must exist');
        assert.ok(html.includes('id="settBuyerGst"'), 'settBuyerGst field must exist and be protected');
        assert.ok(html.includes('id="settBuyerRep"'), 'settBuyerRep field must exist');
        assert.ok(html.includes('id="settBuyerPhone"'), 'settBuyerPhone field must exist');
        assert.ok(html.includes('id="settBuyerEmail"'), 'settBuyerEmail field must exist');
        assert.ok(html.includes('id="settBuyerCategory"'), 'settBuyerCategory field must exist');
        assert.ok(html.includes('id="settBuyerBudget"'), 'settBuyerBudget field must exist');
        assert.ok(html.includes('id="settBuyerWarehouse"'), 'settBuyerWarehouse field must exist');
        assert.ok(html.includes('loadBuyerProfileForEdit()'), 'loadBuyerProfileForEdit caller must exist');
        assert.ok(html.includes('handleSaveBuyerSettings(event)'), 'handleSaveBuyerSettings submit caller must exist');

        // Controller module registrations
        assert.ok(html.includes("farmerModules = ["), 'farmerModules router exists');
        assert.ok(html.includes("'settings': 'Farmer Settings'"), 'Farmer settings module title registered');
        assert.ok(html.includes("'settings': 'Company Settings'"), 'Buyer settings module title registered');
    });

    await t.test('4. Farmer Crops for Sale Toolbar and Pagination Logic', () => {
        // Toolbar UI elements in Overview and Full panel
        assert.ok(html.includes('id="fcSearchInput"'), 'Farmer crop search input in overview must exist');
        assert.ok(html.includes('id="fcCropTypeFilter"'), 'Farmer crop type filter must exist');
        assert.ok(html.includes('id="fcStatusFilter"'), 'Farmer crop status filter must exist');
        assert.ok(html.includes('id="fcSortFilter"'), 'Farmer crop sort select must exist');
        assert.ok(html.includes('id="fcPageSizeSelect"'), 'Farmer crop per-page selector must exist');
        assert.ok(html.includes('id="fcResultCount"'), 'Farmer crop result count display must exist');
        assert.ok(html.includes('id="fcPageIndicator"'), 'Farmer crop pagination page indicator must exist');
        assert.ok(html.includes('id="fcPrevPageBtn"'), 'Farmer crop pagination prev button must exist');
        assert.ok(html.includes('id="fcNextPageBtn"'), 'Farmer crop pagination next button must exist');

        // Full panel mirror elements
        assert.ok(html.includes('id="fcSearchInputFull"'), 'Farmer crop search input in full panel must exist');
        assert.ok(html.includes('id="fcCropTypeFilterFull"'), 'Farmer crop type filter in full panel must exist');
        assert.ok(html.includes('id="fcStatusFilterFull"'), 'Farmer crop status filter in full panel must exist');
        assert.ok(html.includes('id="fcSortFilterFull"'), 'Farmer crop sort select in full panel must exist');

        // JavaScript pagination state and handler functions
        assert.ok(html.includes('pageSize: 9'), 'Default farmer crop page size should be 9');
        assert.ok(html.includes('function handleFarmerCropFilterChange('), 'handleFarmerCropFilterChange must exist');
        assert.ok(html.includes('function resetFarmerCropFilters()'), 'resetFarmerCropFilters must exist');
        assert.ok(html.includes('function setFarmerCropPageSize('), 'setFarmerCropPageSize must exist');
        assert.ok(html.includes('function changeFarmerCropPage('), 'changeFarmerCropPage must exist');
        assert.ok(html.includes('function renderFarmerCrops('), 'renderFarmerCrops must exist');
    });

    await t.test('5. Buyer Open Purchase Requirements Toolbar and Pagination Logic', () => {
        // Toolbar UI elements in Overview and Full panel
        assert.ok(html.includes('id="bnSearchInput"'), 'Buyer need search input must exist');
        assert.ok(html.includes('id="bnStatusFilter"'), 'Buyer need status filter must exist');
        assert.ok(html.includes('id="bnCropTypeFilter"'), 'Buyer need crop filter must exist');
        assert.ok(html.includes('id="bnSortFilter"'), 'Buyer need sort select must exist');
        assert.ok(html.includes('id="bnPageSizeSelect"'), 'Buyer need per-page selector must exist');
        assert.ok(html.includes('id="bnResultCount"'), 'Buyer need result count display must exist');
        assert.ok(html.includes('id="bnPageIndicator"'), 'Buyer need pagination indicator must exist');
        assert.ok(html.includes('id="bnPrevPageBtn"'), 'Buyer need pagination prev button must exist');
        assert.ok(html.includes('id="bnNextPageBtn"'), 'Buyer need pagination next button must exist');

        // Full panel mirror elements
        assert.ok(html.includes('id="bnSearchInputFull"'), 'Buyer need search input in full panel must exist');
        assert.ok(html.includes('id="bnStatusFilterFull"'), 'Buyer need status filter in full panel must exist');
        assert.ok(html.includes('id="bnCropTypeFilterFull"'), 'Buyer need crop filter in full panel must exist');
        assert.ok(html.includes('id="bnSortFilterFull"'), 'Buyer need sort filter in full panel must exist');

        // JavaScript pagination state and handler functions
        assert.ok(html.includes('pageSize: 6'), 'Default buyer need page size should be 6');
        assert.ok(html.includes('function handleBuyerNeedFilterChange('), 'handleBuyerNeedFilterChange must exist');
        assert.ok(html.includes('function resetBuyerNeedFilters()'), 'resetBuyerNeedFilters must exist');
        assert.ok(html.includes('function setBuyerNeedPageSize('), 'setBuyerNeedPageSize must exist');
        assert.ok(html.includes('function changeBuyerNeedPage('), 'changeBuyerNeedPage must exist');
        assert.ok(html.includes('function renderBuyerNeeds()'), 'renderBuyerNeeds must exist');
    });

    await t.test('6. Cancel Requirement Modal, Soft Cancellation, and Multi-Click Prevention', () => {
        // Modal element exists
        assert.ok(html.includes('id="cancelRequirementModal"'), 'cancelRequirementModal must exist');
        assert.ok(html.includes('id="cancelReqModalId"'), 'cancelReqModalId must exist');
        assert.ok(html.includes('id="cancelReqModalCrop"'), 'cancelReqModalCrop must exist');
        assert.ok(html.includes('id="cancelReqModalPrice"'), 'cancelReqModalPrice must exist');
        assert.ok(html.includes('id="btnConfirmCancelReq"'), 'btnConfirmCancelReq must exist');

        // Functions for modal handling
        assert.ok(html.includes('function promptCancelBuyerRequirement('), 'promptCancelBuyerRequirement must exist');
        assert.ok(html.includes('function closeCancelRequirementModal()'), 'closeCancelRequirementModal must exist');
        assert.ok(html.includes('function confirmCancelBuyerRequirement()'), 'confirmCancelBuyerRequirement must exist');
        assert.ok(html.includes('function deleteBuyerDemandAction('), 'deleteBuyerDemandAction must exist');

        // Multi-click prevention and loading state
        assert.ok(html.includes('btn.disabled = true'), 'Confirm button must be disabled during cancellation');
        assert.ok(html.includes('fa-spinner'), 'Loading spinner must be rendered to prevent duplicate clicks');

        // Soft deletion representation
        assert.ok(html.includes("b.isActive === false || b.status === 'Cancelled'"), 'Soft cancelled status must be recognized in UI');
        assert.ok(html.includes('Cancelled Requirement'), 'Cancelled requirements must render distinct status badge and disabled cancel button');
    });

    await t.test('7. Reorganized Buyer Procurement Tools Grid (Company Details removed, 3 cards added)', () => {
        const toolsGridMatch = html.match(/<!-- BUYER TOOLS NAVIGATION -->([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<!-- SUB-PANEL: BUYER PROFILE/);
        assert.ok(toolsGridMatch, 'Buyer procurement tools grid must be found in HTML');
        const toolsGrid = toolsGridMatch[1];

        // 1. Company Details card must NOT be in the overview grid
        assert.ok(!toolsGrid.includes("openBuyerModule('profile')"), 'Company Details card (openBuyerModule profile) must NOT be in overview grid');
        assert.ok(!toolsGrid.includes('Company Profile & Verification'), 'Company Profile title must NOT be in overview grid');

        // 2. Farmer Ratings & Trust card MUST be present
        assert.ok(toolsGrid.includes("openBuyerModule('feedback')"), 'Farmer Ratings card must be present in tools grid');
        assert.ok(toolsGrid.includes('Farmer Ratings & Trust'), 'Farmer Ratings title must be present');

        // 3. Plan Future Demand card MUST be present
        assert.ok(toolsGrid.includes("openBuyerModule('demand-predict')"), 'Plan Future Demand card must be present in tools grid');
        assert.ok(toolsGrid.includes('Plan Future Demand'), 'Plan Future Demand title must be present');

        // 4. My Contracts & Deliveries card MUST be present
        assert.ok(toolsGrid.includes("openBuyerModule('contracts')"), 'My Contracts card must be present in tools grid');
        assert.ok(toolsGrid.includes('My Contracts & Deliveries'), 'My Contracts & Deliveries title must be present');

        // 5. Existing cards remain: Directory / Find Available Crops, Supply Match / AI Matcher, Supply & Price Alerts
        assert.ok(toolsGrid.includes("openBuyerModule('crop-search')"), 'Find Available Crops card must be present');
        assert.ok(toolsGrid.includes("openBuyerModule('ai-matcher')"), 'Find Matching Farmers card must be present');
        assert.ok(toolsGrid.includes("openBuyerModule('risk-analytics')"), 'Supply & Price Alerts card must be present');

        // Total cards in overview grid should be 6
        const cardCount = (toolsGrid.match(/onclick="openBuyerModule\(/g) || []).length;
        assert.equal(cardCount, 6, 'Overview Procurement Tools grid must contain exactly 6 cards');
    });

    await t.test('8. Supply & Price Alerts Renaming & 5 Headings', () => {
        // Sidebar navigation rename
        assert.ok(
            html.includes('Supply & Price Alerts') && html.includes('id="buyerNav-risk-analytics"'),
            'Buyer sidebar must show Supply & Price Alerts with id buyerNav-risk-analytics'
        );

        // Subpanel title
        const alertsPanel = html.slice(html.indexOf('id="bpanel-risk-analytics"'), html.indexOf('id="bpanel-feedback"'));
        assert.ok(alertsPanel.includes('Supply & Price Alerts'), 'bpanel-risk-analytics title must be Supply & Price Alerts');

        // 5 Simple Headings
        assert.ok(alertsPanel.includes('1. Crop Availability'), 'Heading 1: Crop Availability must be present');
        assert.ok(alertsPanel.includes('2. Weather Risks'), 'Heading 2: Weather Risks must be present');
        assert.ok(alertsPanel.includes('3. Price Changes'), 'Heading 3: Price Changes must be present');
        assert.ok(alertsPanel.includes('4. Supply Shortages'), 'Heading 4: Supply Shortages must be present');
        assert.ok(alertsPanel.includes('5. Suggested Actions'), 'Heading 5: Suggested Actions must be present');
    });

    await t.test('9. Buyer BigBasket demo account credentials configured', () => {
        assert.ok(
            html.includes('70c1f890-c357-45b7-8e5c-c8cf7f722600'),
            'BigBasket buyer UUID must be mapped to buyer username'
        );
    });
});
