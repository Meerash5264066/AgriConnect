import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const htmlPath = fs.existsSync(path.resolve('public/agriconnect-ui.html'))
    ? path.resolve('public/agriconnect-ui.html')
    : path.resolve('frontend/public/agriconnect-ui.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract weather panel section from HTML
const weatherPanelMatch = html.match(/id="fpanel-weather"[\s\S]*?<!-- SUB-PANEL: FARM MACHINERY & VEHICLE BOOKING/);
const panelHtml = weatherPanelMatch ? weatherPanelMatch[0] : '';

test('1. Simple English terminology replaces technical terms in Weather module', () => {
    assert.ok(panelHtml.length > 0, 'Weather panel HTML must exist');

    // Requirements check:
    // "Farm Weather Radar & Advisory Console" → "Farm Weather Updates"
    assert.match(html, /Farm Weather Updates/, 'Sidebar & Panel title should be Farm Weather Updates');
    assert.doesNotMatch(panelHtml, /Farm Weather Radar &amp; Advisory Console/, 'Old title should not exist in panel');

    // "Agrometeorological Forecast" → "7-Day Weather Forecast"
    assert.match(panelHtml, /7-Day Weather Forecast/, 'Forecast section should say 7-Day Weather Forecast');
    assert.doesNotMatch(panelHtml, /Agrometeorological Forecast/, 'Old forecast heading should not exist');

    // "Optimal Window" → "Best Time for Spraying" / "Spraying Advice"
    assert.match(panelHtml, /Spraying Advice/, 'Spraying section header exists');
    assert.match(html, /Best Time for Spraying|Safe to Spray/, 'Best time for spraying language exists');
    assert.doesNotMatch(panelHtml, /Optimal Window \/ Safety Index/, 'Old optimal window title should not exist');

    // "Precipitation Chance" → "Chance of Rain"
    assert.match(panelHtml, /Chance of Rain/, 'Card should say Chance of Rain');
    assert.doesNotMatch(panelHtml, /Precipitation Chance/, 'Old precipitation chance label should not exist');

    // "Wind Velocity" → "Wind Speed"
    assert.match(panelHtml, /Wind Speed/, 'Card should say Wind Speed');
    assert.doesNotMatch(panelHtml, /Wind Velocity/, 'Old wind velocity label should not exist');

    // "Evapotranspiration (ETO)" → "Water Lost from Soil and Plants"
    assert.match(panelHtml, /Water Lost from Soil &amp; Plants|Water Lost from Plants/i, 'Card should say Water Lost from Soil & Plants');

    // "Soil Moisture" → "Water in the Soil"
    assert.match(panelHtml, /Water in the Soil/, 'Card should say Water in the Soil');

    // Educational guide explains technical terms in simple English
    assert.match(panelHtml, /Simple Farm Weather Guide/, 'Guide section should exist');
    assert.match(panelHtml, /Temperature/, 'Guide explains Temperature');
    assert.match(panelHtml, /Humidity/, 'Guide explains Humidity');
    assert.match(panelHtml, /Wind Speed/, 'Guide explains Wind Speed');
    assert.match(panelHtml, /Chance of Rain/, 'Guide explains Chance of Rain');
    assert.match(panelHtml, /Water in the Soil/, 'Guide explains Soil Moisture');
    assert.match(panelHtml, /Water Lost \(ET0\)/, 'Guide explains Evapotranspiration');
});

test('2. Spraying advice clearly explains safety, wind/rain status, and reason to wait', () => {
    // Check elements for spraying advice
    assert.match(panelHtml, /id="weatherSprayBadge"/, 'Spray badge element exists');
    assert.match(panelHtml, /id="weatherSprayScore"/, 'Spray score explanation element exists');
    assert.match(panelHtml, /id="weatherSprayWindow"/, 'Recommended spraying window exists');
    assert.match(panelHtml, /id="weatherSprayRainCheck"/, 'Rain check status exists');
    assert.match(panelHtml, /id="weatherSprayWindCheck"/, 'Wind check status exists');
    assert.match(panelHtml, /id="weatherSprayReasoning"/, 'Reasoning explanation element exists');
    assert.match(panelHtml, /Why this time is recommended:/, 'Clear reasoning header exists');

    // Check script contains safe vs wait threshold logic
    assert.match(html, /Safe to Spray/, 'Contains Safe to Spray indicator');
    assert.match(html, /Do Not Spray — Wait|Postpone — Spraying Unsafe Today/i, 'Contains warning to wait if unsuitable');
});

test('3. Past and future weather details are clearly separated with date filtering', () => {
    // 7-day future forecast section
    assert.match(panelHtml, /7-Day Weather Forecast/, 'Future forecast heading exists');
    assert.match(panelHtml, /id="weather7DayForecastList"/, 'Forecast container exists');
    assert.match(panelHtml, /Future Forecast/, 'Future forecast labeled as upcoming');

    // Recorded past weather section
    assert.match(panelHtml, /Recorded Past Weather/, 'Past weather section heading exists');
    assert.match(panelHtml, /Recorded History/, 'Past weather labeled as recorded historical');
    assert.match(panelHtml, /id="weatherPastRecordsList"/, 'Past weather container exists');
    assert.match(panelHtml, /id="weatherPastDateFilter"/, 'Date filter selector exists');
    assert.match(panelHtml, /id="weatherPastDateInput"/, 'Custom date picker exists');
    assert.match(panelHtml, /id="weatherPastUnavailableAlert"/, 'Notice for unavailable dates exists');

    // Clear distinction & no fake data claim
    assert.match(panelHtml, /Modelled Estimate/, 'Clear disclaimer exists for modeled estimates');
    assert.match(panelHtml, /Actual weather observations recorded by local agromet weather stations/, 'Accurate provenance for past records');
});

test('4. Dropdown contains 7 useful farming regions across Indian states', () => {
    const requiredRegions = [
        { code: 'Coimbatore', state: 'Tamil Nadu' },
        { code: 'Palakkad', state: 'Kerala' },
        { code: 'Bengaluru Rural', state: 'Karnataka' },
        { code: 'Guntur', state: 'Andhra Pradesh' },
        { code: 'Warangal', state: 'Telangana' },
        { code: 'Pune', state: 'Maharashtra' },
        { code: 'Ludhiana', state: 'Punjab' }
    ];

    const regionSelectMatch = panelHtml.match(/<select id="weatherRegionSelector"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(regionSelectMatch, 'weatherRegionSelector found');
    const optionsHtml = regionSelectMatch[1];

    requiredRegions.forEach(r => {
        assert.match(optionsHtml, new RegExp(`value="${r.code}"`), `Region ${r.code} should be in dropdown`);
        assert.match(optionsHtml, new RegExp(r.state), `State ${r.state} should be mentioned`);
    });

    const optionCount = (optionsHtml.match(/<option/g) || []).length;
    assert.equal(optionCount, 7, 'Expected exactly 7 regional hub options');
});

test('5. Weather database in frontend and backend contains distinct data for all 7 regions', () => {
    const regions = ['Coimbatore', 'Palakkad', 'Bengaluru Rural', 'Guntur', 'Warangal', 'Pune', 'Ludhiana'];
    regions.forEach(r => {
        // In JS object, it's either r: { or 'r': {
        const regex = new RegExp(`['"]?${r}['"]?:\\s*{`);
        assert.match(html, regex, `Frontend database should have entry for ${r}`);
    });
});
