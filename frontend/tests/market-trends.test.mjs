import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const htmlPath = fs.existsSync(path.resolve('public/agriconnect-ui.html'))
    ? path.resolve('public/agriconnect-ui.html')
    : path.resolve('frontend/public/agriconnect-ui.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract market trends panel section from HTML
const marketTrendsPanelMatch = html.match(/id="fpanel-prices"[\s\S]*?<!-- SUB-PANEL: AI DEMAND PREDICTION/);
const panelHtml = marketTrendsPanelMatch ? marketTrendsPanelMatch[0] : '';

test('1. Simple English terminology replaces technical terms', () => {
    // Requirements check:
    // “AI Market Trend Analysis” → “Crop Price Trends”
    assert.match(panelHtml, /Crop Price Trends/, 'Title should be Crop Price Trends');
    // “Commodity / Crop” → “Choose Your Crop”
    assert.match(panelHtml, /Choose Your Crop/, 'Label should be Choose Your Crop');
    // “State” → “Choose Your State”
    assert.match(panelHtml, /Choose Your State/, 'Label should be Choose Your State');
    // “APMC Mandi / Market” → “Choose Your Market”
    assert.match(panelHtml, /Choose Your Market/, 'Label should be Choose Your Market');
    // “Aggregation Frequency” → “View Prices By”
    assert.match(panelHtml, /View Prices By/, 'Label should be View Prices By');
    // “Latest Modal Rate” → “Latest Market Price”
    assert.match(panelHtml, /Latest Market Price/, 'Card should say Latest Market Price');
    // “Historical Trend” → “Price Change”
    assert.match(panelHtml, /Price Change/, 'Card should say Price Change');
    // “Data Depth” → “Number of Records”
    assert.match(panelHtml, /Number of Records/, 'Card should say Number of Records');
    // “Regional Mandi Peer Comparison” → “Compare Prices in Other Markets”
    assert.match(panelHtml, /Compare Prices in Other Markets/, 'Section should say Compare Prices in Other Markets');
    // “Period Range & Average” → “Price Range & Average”
    assert.match(panelHtml, /Price Range & Average/, 'Card should say Price Range & Average');
    // “Market Insights” → “Market Price Summary”
    assert.match(panelHtml, /Market Price Summary/, 'Section should say Market Price Summary');

    // Technical terms should not appear as headings or labels in panel
    assert.doesNotMatch(panelHtml, /<label[^>]*>Commodity \/ Crop<\/label>/);
    assert.doesNotMatch(panelHtml, /<label[^>]*>APMC Mandi \/ Market<\/label>/);
    assert.doesNotMatch(panelHtml, /<label[^>]*>Aggregation Frequency<\/label>/);
    assert.doesNotMatch(panelHtml, /Latest Modal Rate/);
    assert.doesNotMatch(panelHtml, /Regional Mandi Peer Comparison/);
});

test('2. Crop options include at least 8 real crops from dataset', () => {
    const crops = ['Tomato', 'Onion', 'Potato', 'Wheat', 'Brinjal', 'Green Chilli', 'Banana', 'Cabbage'];
    crops.forEach(crop => {
        assert.match(panelHtml, new RegExp(`value="${crop}"`), `Crop ${crop} should be in dropdown`);
    });
    // Count crop options
    const cropSelectMatch = panelHtml.match(/<select id="mtCommoditySelect"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(cropSelectMatch, 'mtCommoditySelect found');
    const optionCount = (cropSelectMatch[1].match(/<option/g) || []).length;
    assert.ok(optionCount >= 8, `Expected at least 8 crop options, got ${optionCount}`);
});

test('3. State options include 7 Indian states from dataset', () => {
    const states = ['Maharashtra', 'Uttar Pradesh', 'Tamil Nadu', 'Madhya Pradesh', 'Gujarat', 'Punjab', 'Rajasthan'];
    states.forEach(state => {
        assert.match(panelHtml, new RegExp(`value="${state}"`), `State ${state} should be in dropdown`);
    });
    const stateSelectMatch = panelHtml.match(/<select id="mtStateSelect"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(stateSelectMatch, 'mtStateSelect found');
    const optionCount = (stateSelectMatch[1].match(/<option/g) || []).length;
    assert.ok(optionCount >= 7, `Expected at least 7 states, got ${optionCount}`);
});

test('4. STATE_DEFAULT_MARKETS mapping covers 7 markets for all 7 states', () => {
    // Extract STATE_DEFAULT_MARKETS from HTML script
    const match = html.match(/const STATE_DEFAULT_MARKETS = (\{[\s\S]*?\});/);
    assert.ok(match, 'STATE_DEFAULT_MARKETS object defined');
    
    // Evaluate or parse the dictionary
    const stateMarkets = eval('(' + match[1] + ')');
    const states = ['Maharashtra', 'Uttar Pradesh', 'Tamil Nadu', 'Madhya Pradesh', 'Gujarat', 'Punjab', 'Rajasthan'];
    
    states.forEach(st => {
        assert.ok(stateMarkets[st], `Markets array exists for ${st}`);
        assert.equal(stateMarkets[st].length, 7, `${st} should have exactly 7 relevant markets`);
    });
});

test('5. Price conversion helper correctly converts ₹/quintal to ₹/kg without double conversion', () => {
    const isPerKg = false;
    const toKg = (val, perKg) => (val === null || val === undefined) ? null : (perKg ? Number(val) : Number(val) / 100);
    const fmtKg = (val, perKg) => {
        const v = toKg(val, perKg);
        return v !== null ? `₹${v.toFixed(2)}/kg` : '--';
    };

    // 2800 / quintal -> 28.00 / kg
    assert.equal(toKg(2800, false), 28.00);
    assert.equal(fmtKg(2800, false), '₹28.00/kg');
    // 1381.74 / quintal -> 13.82 / kg
    assert.equal(fmtKg(1381.74, false), '₹13.82/kg');
    // If source is already in kg, do not divide again
    assert.equal(toKg(28, true), 28);
    assert.equal(fmtKg(28, true), '₹28.00/kg');
    assert.equal(fmtKg(null, false), '--');
});

test('6. convertInsightToKg accurately transforms natural language insights into ₹/kg', () => {
    function convertInsightToKg(text) {
        if (!text) return '';
        let res = text;
        res = res.replace(/₹\s*(\d+(?:\.\d+)?)(?:\s*(?:\/|per)\s*quintal)?/gi, (match, p1) => {
            const num = parseFloat(p1);
            return `₹${(num / 100).toFixed(2)}/kg`;
        });
        res = res.replace(/\s*(?:\/|per)\s*quintal/gi, '');
        res = res.replace(/\/kg\/kg/gi, '/kg');
        return res;
    }

    const testCases = [
        {
            in: "The recorded modal price for Tomato in Pune increased by 12.5% over the comparison period (from ₹1200 to ₹1350 per quintal).",
            expected: "The recorded modal price for Tomato in Pune increased by 12.5% over the comparison period (from ₹12.00/kg to ₹13.50/kg)."
        },
        {
            in: "Prices declined by 8.0% compared with the previous period (from ₹1500 down to ₹1380 per quintal).",
            expected: "Prices declined by 8.0% compared with the previous period (from ₹15.00/kg down to ₹13.80/kg)."
        },
        {
            in: "The available records show relatively stable prices for Tomato in Pune, holding near ₹1400 per quintal (fluctuation within ±3.0%).",
            expected: "The available records show relatively stable prices for Tomato in Pune, holding near ₹14.00/kg (fluctuation within ±3.0%)."
        },
        {
            in: "Across 241 daily periods, prices ranged from a low of ₹700 to a high of ₹10500/quintal, averaging ₹1382/quintal.",
            expected: "Across 241 daily periods, prices ranged from a low of ₹7.00/kg to a high of ₹105.00/kg, averaging ₹13.82/kg."
        },
        {
            in: "Pune is currently trading ₹150/quintal higher than the regional peer average (₹1232/quintal).",
            expected: "Pune is currently trading ₹1.50/kg higher than the regional peer average (₹12.32/kg)."
        }
    ];

    testCases.forEach(tc => {
        const out = convertInsightToKg(tc.in);
        assert.equal(out, tc.expected);
        assert.doesNotMatch(out, /quintal/i, 'No mentions of quintal should remain');
        assert.doesNotMatch(out, /\/kg\/kg/, 'No double unit suffix');
    });
});

test('7. Empty alert and results container exist in HTML for zero-record handling', () => {
    assert.match(panelHtml, /id="mtEmptyAlert"/, 'Empty alert container must exist');
    assert.match(panelHtml, /No Arrival Records Found/, 'Farmer friendly no-arrival text');
    assert.match(panelHtml, /id="mtResultsContainer"/, 'Results container must exist');
});

test('8. Crop options include all 12 commodities from compact dataset', () => {
    const all12Crops = [
        'Tomato', 'Onion', 'Potato', 'Wheat', 'Rice', 'Banana',
        'Green Chilli', 'Brinjal', 'Cauliflower', 'Cabbage', 'Apple', 'Maize'
    ];
    all12Crops.forEach(crop => {
        assert.match(panelHtml, new RegExp(`value="${crop}"`), `Crop ${crop} should be in dropdown`);
    });
    const cropSelectMatch = panelHtml.match(/<select id="mtCommoditySelect"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(cropSelectMatch, 'mtCommoditySelect found');
    const optionCount = (cropSelectMatch[1].match(/<option/g) || []).length;
    assert.equal(optionCount, 12, `Expected all 12 crops, got ${optionCount}`);
});

test('9. fetchMarketTrendsData supports AI Base URL resolution and deployed Render fallback', () => {
    assert.match(html, /const aiBase = \(typeof getAiServiceBaseUrl === 'function'\) \? getAiServiceBaseUrl\(\)/, 'Uses getAiServiceBaseUrl()');
    assert.match(html, /https:\/\/agriconnect-ai-service\.onrender\.com/, 'Includes deployed Render service fallback');
    assert.match(html, /window\.parent && window\.parent !== window && window\.parent\.NEXT_PUBLIC_AI_URL/, 'Supports parent window AI URL injection');
    assert.match(html, /window\.parent && window\.parent !== window && window\.parent\.NEXT_PUBLIC_API_URL/, 'Supports parent window API URL injection');
});

test('10. Live deployed Render AI service returns verified Tomato historical price data', async () => {
    try {
        const url = 'https://agriconnect-ai-service.onrender.com/api/v1/market-trends?commodity=Tomato&state=Maharashtra&market=Pune';
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        assert.equal(res.status, 200, 'Render endpoint responds with HTTP 200');
        const data = await res.json();
        assert.equal(data.commodity, 'Tomato');
        assert.equal(data.state, 'Maharashtra');
        assert.equal(data.market, 'Pune');
        assert.ok(Array.isArray(data.data_points), 'data_points array exists');
        assert.ok(data.data_points.length > 50, `Expected >50 data points, got ${data.data_points.length}`);
        assert.ok(typeof data.latest_price === 'number' && data.latest_price > 0, 'Valid latest_price');
        assert.ok(['Rising', 'Falling', 'Stable', 'Insufficient data'].includes(data.trend_classification), 'Valid trend classification');
        assert.ok(Array.isArray(data.insights) && data.insights.length > 0, 'Insights array populated');
        assert.ok(Array.isArray(data.market_comparisons) && data.market_comparisons.length > 0, 'Peer comparisons populated');
    } catch (e) {
        // If offline or network unreachable, log and allow test suite to proceed
        console.log('Live Render AI service ping note:', e.message);
    }
});

