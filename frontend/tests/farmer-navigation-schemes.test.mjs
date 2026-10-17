import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML_PATH = fs.existsSync(path.resolve('public/agriconnect-ui.html'))
    ? path.resolve('public/agriconnect-ui.html')
    : path.resolve('frontend/public/agriconnect-ui.html');
const html = fs.readFileSync(HTML_PATH, 'utf-8');

test('Farmer Dashboard, Navigation & Government Schemes Test Suite', async (t) => {
    
    await t.test('1. Five cards removed from main dashboard overview only', () => {
        // Find the cards grid inside fpanel-overview
        const cardsGridMatch = html.match(/<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<!-- SUB-PANEL: FARMER PROFILE/);
        assert.ok(cardsGridMatch, 'Overview cards grid should be found in HTML');
        const cardsGrid = cardsGridMatch[1];

        // 1. Farmer Profile card must NOT be in the overview grid
        assert.ok(!cardsGrid.includes("openFarmerModule('profile')"), 'Farmer Profile card must not be in overview grid');
        assert.ok(!cardsGrid.includes('Farmer Profile'), 'Farmer Profile title must not be in overview grid');

        // 2. Farm Details & Soil Health card must NOT be in the overview grid
        assert.ok(!cardsGrid.includes("openFarmerModule('farm-details')"), 'Farm Details & Soil Health card must not be in overview grid');
        assert.ok(!cardsGrid.includes('Farm Details & Soil Health'), 'Farm Details & Soil Health title must not be in overview grid');

        // 3. Contracts & Supply Schedules card must NOT be in the overview grid
        assert.ok(!cardsGrid.includes("openFarmerModule('contracts')"), 'Contracts & Supply Schedules card must not be in overview grid');
        assert.ok(!cardsGrid.includes('Contracts & Supply Schedules'), 'Contracts & Supply Schedules title must not be in overview grid');

        // 4. Supply & Dispatch History card must NOT be in the overview grid
        assert.ok(!cardsGrid.includes("openFarmerModule('supply-history')"), 'Supply & Dispatch History card must not be in overview grid');
        assert.ok(!cardsGrid.includes('Supply & Dispatch History'), 'Supply & Dispatch History title must not be in overview grid');

        // 5. Payments & Escrow Payouts card must NOT be in the overview grid
        assert.ok(!cardsGrid.includes("openFarmerModule('payments')"), 'Payments card must not be in overview grid');
        assert.ok(!cardsGrid.includes('Payments & Escrow Payouts'), 'Payments & Escrow Payouts title must not be in overview grid');

        // Confirm the exactly 6 useful cards ARE in overview grid:
        assert.ok(cardsGrid.includes("openFarmerModule('vehicles')"), 'Rent Farm Equipment card must be present');
        assert.ok(cardsGrid.includes('Rent Farm Equipment'), 'Rent Farm Equipment title must be present');

        assert.ok(cardsGrid.includes("openFarmerModule('disease')"), 'Check Crop Health card must be present');
        assert.ok(cardsGrid.includes('Check Crop Health'), 'Check Crop Health title must be present');

        assert.ok(cardsGrid.includes("openFarmerModule('crop-recom')"), 'Crop Growing Advice card must be present');
        assert.ok(cardsGrid.includes('Crop Growing Advice'), 'Crop Growing Advice title must be present');

        assert.ok(cardsGrid.includes("openFarmerModule('prices')"), 'Market Prices card must be present');
        assert.ok(cardsGrid.includes('Market Prices'), 'Market Prices title must be present');

        assert.ok(cardsGrid.includes("openFarmerModule('weather')"), 'Weather for My Farm card must be present');
        assert.ok(cardsGrid.includes('Weather for My Farm'), 'Weather for My Farm title must be present');

        assert.ok(cardsGrid.includes("openFarmerModule('schemes')"), 'Government Schemes card must be present');
        assert.ok(cardsGrid.includes('Government Schemes'), 'Government Schemes title must be present');
    });

    await t.test('2. Removed features remain fully accessible via subpanels and controller', () => {
        // Verify subpanels still exist in DOM
        assert.ok(html.includes('id="fpanel-profile"'), 'fpanel-profile subpanel must exist');
        assert.ok(html.includes('id="fpanel-farm-details"'), 'fpanel-farm-details subpanel must exist');
        assert.ok(html.includes('id="fpanel-contracts"'), 'fpanel-contracts subpanel must exist');
        assert.ok(html.includes('id="fpanel-supply-history"'), 'fpanel-supply-history subpanel must exist');
        assert.ok(html.includes('id="fpanel-payments"'), 'fpanel-payments subpanel must exist');

        // Verify module controller has all module IDs
        ['overview', 'profile', 'farm-details', 'crops', 'contracts', 'supply-history', 'payments', 'vehicles', 'schemes'].forEach(mod => {
            assert.ok(html.includes(`'${mod}'`), `Module controller must register '${mod}'`);
        });
    });

    await t.test('3. Side navigation organized into 5 clear groups with farmer-friendly labels', () => {
        const navMatch = html.match(/<nav id="farmerSideNav"[\s\S]*?<\/nav>/);
        assert.ok(navMatch, 'farmerSideNav container must exist');
        const nav = navMatch[0];

        // 5 section titles
        assert.ok(nav.includes('My Farm'), 'My Farm group must exist');
        assert.ok(nav.includes('Crops and Buyers'), 'Crops and Buyers group must exist');
        assert.ok(nav.includes('Farm Services'), 'Farm Services group must exist');
        assert.ok(nav.includes('Payments'), 'Payments group must exist');
        assert.ok(nav.includes('Government Schemes'), 'Government Schemes group must exist');

        // Check farmer-friendly labels in navigation
        assert.ok(nav.includes('My Dashboard'), 'My Dashboard label must be present');
        assert.ok(nav.includes('My Farmer Details'), 'My Farmer Details label must be present');
        assert.ok(nav.includes('My Farm and Soil'), 'My Farm and Soil label must be present');
        assert.ok(nav.includes('My Crops for Sale'), 'My Crops for Sale label must be present');
        assert.ok(nav.includes('Buyer Agreements and Deliveries'), 'Buyer Agreements and Deliveries label must be present');
        assert.ok(nav.includes('Delivery History'), 'Delivery History label must be present');
        assert.ok(nav.includes('My Payments'), 'My Payments label must be present');
        assert.ok(nav.includes('Rent Farm Equipment'), 'Rent Farm Equipment label must be present');
        assert.ok(nav.includes('Crop Growing Advice'), 'Crop Growing Advice label must be present');
        assert.ok(nav.includes('Check Crop Health'), 'Check Crop Health label must be present');
        assert.ok(nav.includes('Market Prices'), 'Market Prices label must be present');
        assert.ok(nav.includes('Weather for My Farm'), 'Weather for My Farm label must be present');

        // Farm machinery must NOT be a separate top promotional item
        assert.ok(!nav.includes('Farm Machinery & Vehicles'), 'Old technical label Farm Machinery & Vehicles should be replaced');
    });

    await t.test('4. Government Schemes exact naming and dual entry points', () => {
        // 1. In side menu
        const navMatch = html.match(/<nav id="farmerSideNav"[\s\S]*?<\/nav>/);
        assert.ok(navMatch[0].includes("openFarmerModule('schemes')"), 'Government Schemes link in side menu');
        assert.ok(navMatch[0].includes('Government Schemes'), 'Exact name in side menu');

        // 2. On dashboard overview card
        const overviewMatch = html.match(/<div id="fpanel-overview"[\s\S]*?<\/div>\s*<!-- SUB-PANEL: FARMER PROFILE/);
        assert.ok(overviewMatch[0].includes("openFarmerModule('schemes')"), 'Government Schemes card on dashboard');
        assert.ok(overviewMatch[0].includes('Government Schemes'), 'Exact title on dashboard card');
        assert.ok(overviewMatch[0].includes('Find government help for farming, loans, subsidies and crop insurance.'), 'Required exact description');
        assert.ok(overviewMatch[0].includes('View Schemes'), 'View Schemes button text');

        // 3. In page header
        const schemesPanel = html.match(/<div id="fpanel-schemes"[\s\S]*?<\/section>/);
        assert.ok(schemesPanel, 'fpanel-schemes container must exist');
        assert.ok(schemesPanel[0].includes('<h2 class="text-2xl sm:text-3xl font-black mt-2">Government Schemes</h2>'), 'Exact heading on page');
        assert.ok(schemesPanel[0].includes("openFarmerModule('overview')"), 'Working return to dashboard button');
    });

    await t.test('5. Verified official government schemes and URLs', () => {
        const schemesPanel = html.match(/<div id="fpanel-schemes"[\s\S]*?<\/section>/)[0];

        const expectedSchemes = [
            { name: 'PM-KISAN', url: 'https://pmkisan.gov.in/' },
            { name: 'Kisan Credit Card', url: 'https://www.myscheme.gov.in/schemes/kcc' },
            { name: 'Pradhan Mantri Fasal Bima Yojana', url: 'https://pmfby.gov.in/' },
            { name: 'Soil Health Card', url: 'https://soilhealth.dac.gov.in/' },
            { name: 'Sub-Mission on Agricultural Mechanization', url: 'https://agrimachinery.nic.in/' },
            { name: 'National Agriculture Market (e-NAM)', url: 'https://enam.gov.in/web/' },
            { name: 'Tamil Nadu Agrisnet', url: 'https://www.tnagrisnet.tn.gov.in/' },
            { name: 'Kisan Call Centre', url: 'https://farmer.gov.in/' }
        ];

        expectedSchemes.forEach(s => {
            assert.ok(schemesPanel.includes(s.name), `Scheme ${s.name} must be present`);
            assert.ok(schemesPanel.includes(s.url), `Official verified URL for ${s.name} must be present (${s.url})`);
        });

        // Verify external link attributes
        const linkMatches = schemesPanel.match(/<a [^>]*href="https:\/\/[^"]*"[^>]*>/g) || [];
        assert.ok(linkMatches.length >= 8, 'At least 8 scheme links should be present');
        linkMatches.forEach(link => {
            assert.ok(link.includes('target="_blank"'), 'Link must open in new tab with target="_blank"');
            assert.ok(link.includes('rel="noopener noreferrer"'), 'Link must have rel="noopener noreferrer"');
        });
    });

    await t.test('6. Payments terminology and explanations', () => {
        const paymentsSection = html.match(/<div id="fpanel-payments"[\s\S]*?<\/div>\s*<!-- SUB-PANEL: AI CROP RECOMMENDATION/);
        assert.ok(paymentsSection, 'fpanel-payments must exist');
        const payments = paymentsSection[0];

        // Explanation text near top
        assert.ok(payments.includes('See payments for your crop deliveries, including money already sent, payments waiting for approval, and payments linked to upcoming deliveries.'), 'Explanation text must be present');

        // Simple summary labels
        assert.ok(payments.includes('Payments Received'), 'Payments Received summary label');
        assert.ok(payments.includes('Payments Waiting for Approval'), 'Payments Waiting for Approval summary label');
        assert.ok(payments.includes('Payments for Upcoming Deliveries'), 'Payments for Upcoming Deliveries summary label');

        // Status badges & button
        assert.ok(html.includes('Payment Sent'), 'Payment Sent status badge');
        assert.ok(html.includes('Payment Waiting for Approval'), 'Payment Waiting for Approval status badge');
        assert.ok(html.includes('Waiting for Crop Delivery'), 'Waiting for Crop Delivery status badge');
        assert.ok(html.includes('Approve and Release Payment'), 'Approve and Release Payment button');
    });

    await t.test('7. Delivery History terminology and details', () => {
        const historySection = html.match(/<div id="fpanel-supply-history"[\s\S]*?<\/div>\s*<!-- SUB-PANEL: PAYMENTS & ESCROW HISTORY/);
        assert.ok(historySection, 'fpanel-supply-history must exist');
        const history = historySection[0];

        assert.ok(history.includes('Delivery History'), 'Heading must be Delivery History');
        assert.ok(html.includes('Remaining to deliver:'), 'Remaining to deliver wording present');
        assert.ok(html.includes('less than planned'), 'Shortfall wording present');
        assert.ok(html.includes('Quality check passed'), 'Quality check wording present');
    });
});
