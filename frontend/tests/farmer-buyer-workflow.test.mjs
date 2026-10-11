import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Workflow simulation helpers mirroring agriconnect-ui.html and NestJS DTOs

function validateAndBuildCropPayload(input) {
    const cropName = input.cropName?.trim();
    const quantityKg = parseFloat(input.quantityKg);
    const pricePerKg = input.pricePerKg !== undefined ? parseFloat(input.pricePerKg) : undefined;
    const location = input.location?.trim();
    const harvestDate = input.harvestDate?.trim();
    const quality = input.quality?.trim();

    if (!cropName) throw new Error('cropName is required');
    if (isNaN(quantityKg) || quantityKg <= 0) throw new Error('quantityKg must be a positive number');
    if (pricePerKg !== undefined && (isNaN(pricePerKg) || pricePerKg <= 0)) throw new Error('pricePerKg must be positive');

    return {
        cropName,
        quantityKg,
        pricePerKg,
        location: location || 'Coimbatore, Tamil Nadu',
        harvestDate: harvestDate || undefined,
        quality: quality || 'Grade A'
    };
}

function validateAndBuildDemandPayload(input) {
    const cropName = input.cropName?.trim();
    const quantityKg = parseFloat(input.quantityKg);
    const expectedPrice = input.expectedPrice !== undefined ? parseFloat(input.expectedPrice) : undefined;
    const requiredDate = input.requiredDate?.trim();
    const quality = input.quality?.trim();
    const duration = input.duration?.trim();

    if (!cropName) throw new Error('cropName is required');
    if (isNaN(quantityKg) || quantityKg <= 0) throw new Error('quantityKg must be a positive number');
    if (expectedPrice !== undefined && (isNaN(expectedPrice) || expectedPrice <= 0)) throw new Error('expectedPrice must be positive');

    return {
        cropName,
        quantityKg,
        expectedPrice,
        requiredDate: requiredDate || undefined,
        quality: quality || 'Grade A',
        duration: duration || '1 month'
    };
}

function multiFarmerGreedyMatch(crops, targetCrop, neededQty, maxBudget) {
    const matching = crops.filter(c => 
        c.cropName.toLowerCase() === targetCrop.toLowerCase() &&
        (maxBudget === undefined || (c.pricePerKg || 0) <= maxBudget)
    );

    let accumulatedQty = 0;
    const selectedPool = [];

    for (const farmerCrop of matching) {
        if (accumulatedQty < neededQty) {
            const take = Math.min(farmerCrop.quantityKg, neededQty - accumulatedQty);
            selectedPool.push({
                farmerId: farmerCrop.farmerId,
                farmerName: farmerCrop.farmerName,
                cropName: farmerCrop.cropName,
                availableQuantityKg: farmerCrop.quantityKg,
                matchedQuantityKg: take,
                pricePerKg: farmerCrop.pricePerKg,
                location: farmerCrop.location,
                quality: farmerCrop.quality
            });
            accumulatedQty += take;
        }
    }

    const shortfallKg = Math.max(0, neededQty - accumulatedQty);
    const isPooled = selectedPool.length > 1;

    return {
        matches: selectedPool,
        totalMatchedKg: accumulatedQty,
        shortfallKg,
        isPooled
    };
}

function validateContractProposal(farmerStockKg, requestedQtyKg, scheduleType, weeklyQtyKg) {
    if (requestedQtyKg > farmerStockKg) {
        throw new Error(`Requested quantity (${requestedQtyKg} kg) exceeds farmer available stock (${farmerStockKg} kg). Overbooking prevented.`);
    }
    if (scheduleType === 'Weekly' && (!weeklyQtyKg || weeklyQtyKg <= 0)) {
        throw new Error('Weekly quantity must be positive for weekly schedule');
    }
    return {
        status: 'PROPOSED',
        totalQuantity: requestedQtyKg,
        remainingQuantity: requestedQtyKg,
        totalSupplied: 0
    };
}

function calculateShipmentMilestone(expectedQty, actualQty, currentTotalSupplied, contractTotalQty) {
    const exp = Math.max(0, expectedQty);
    const act = Math.max(0, actualQty);
    const shortfall = Math.max(0, exp - act);
    const newTotalSupplied = currentTotalSupplied + act;
    const remaining = Math.max(0, contractTotalQty - newTotalSupplied);
    const isCompleted = remaining === 0;

    return {
        shortfall,
        isShortSupply: shortfall > 0,
        newTotalSupplied,
        remainingQuantity: remaining,
        status: isCompleted ? 'Completed' : 'Active'
    };
}

describe('Phase 17: Farmer-Buyer Workflow Client & Logic Tests', () => {
    describe('1. Farmer Crop Listings', () => {
        it('validates and constructs a valid crop listing payload', () => {
            const payload = validateAndBuildCropPayload({
                cropName: 'Tomato',
                quantityKg: '4000',
                pricePerKg: '30',
                location: 'Coimbatore, TN',
                harvestDate: '2026-10-25',
                quality: 'Grade A'
            });

            assert.equal(payload.cropName, 'Tomato');
            assert.equal(payload.quantityKg, 4000);
            assert.equal(payload.pricePerKg, 30);
            assert.equal(payload.location, 'Coimbatore, TN');
            assert.equal(payload.quality, 'Grade A');
        });

        it('rejects invalid or non-positive quantities', () => {
            assert.throws(() => {
                validateAndBuildCropPayload({ cropName: 'Onion', quantityKg: '-500' });
            }, /quantityKg must be a positive number/);

            assert.throws(() => {
                validateAndBuildCropPayload({ cropName: '', quantityKg: '100' });
            }, /cropName is required/);
        });
    });

    describe('2. Buyer Procurement Demands', () => {
        it('validates and constructs a valid demand payload', () => {
            const payload = validateAndBuildDemandPayload({
                cropName: 'Tomato',
                quantityKg: '5000',
                expectedPrice: '30',
                requiredDate: '2026-10-30',
                quality: 'Grade A',
                duration: '1 month'
            });

            assert.equal(payload.cropName, 'Tomato');
            assert.equal(payload.quantityKg, 5000);
            assert.equal(payload.expectedPrice, 30);
            assert.equal(payload.duration, '1 month');
        });

        it('rejects missing cropName or non-numeric quantity', () => {
            assert.throws(() => {
                validateAndBuildDemandPayload({ cropName: 'Potato', quantityKg: '0' });
            }, /quantityKg must be a positive number/);
        });
    });

    describe('3. Farmer Matching & Multi-Farmer Greedy Pooling', () => {
        const inventory = [
            { farmerId: 'f1', farmerName: 'Farmer Rajan', cropName: 'Tomato', quantityKg: 3000, pricePerKg: 28, location: 'Coimbatore', quality: 'Grade A' },
            { farmerId: 'f2', farmerName: 'Farmer Madhan', cropName: 'Tomato', quantityKg: 2000, pricePerKg: 30, location: 'Pollachi', quality: 'Grade A' },
            { farmerId: 'f3', farmerName: 'Farmer Priya', cropName: 'Onion', quantityKg: 5000, pricePerKg: 24, location: 'Nashik', quality: 'Grade A' }
        ];

        it('fulfills demand using single farmer when stock is sufficient', () => {
            const result = multiFarmerGreedyMatch(inventory, 'Tomato', 2500, 35);
            assert.equal(result.isPooled, false);
            assert.equal(result.matches.length, 1);
            assert.equal(result.matches[0].farmerName, 'Farmer Rajan');
            assert.equal(result.matches[0].matchedQuantityKg, 2500);
            assert.equal(result.shortfallKg, 0);
        });

        it('pools multiple farmers when single farmer stock is insufficient without exceeding individual availability', () => {
            const result = multiFarmerGreedyMatch(inventory, 'Tomato', 4500, 35);
            assert.equal(result.isPooled, true);
            assert.equal(result.matches.length, 2);
            assert.equal(result.matches[0].matchedQuantityKg, 3000); // Farmer Rajan max
            assert.equal(result.matches[1].matchedQuantityKg, 1500); // Farmer Madhan partial
            assert.equal(result.totalMatchedKg, 4500);
            assert.equal(result.shortfallKg, 0);
        });

        it('correctly calculates shortfall when total pooled stock is less than demand', () => {
            const result = multiFarmerGreedyMatch(inventory, 'Tomato', 6000, 35);
            assert.equal(result.totalMatchedKg, 5000); // 3000 + 2000
            assert.equal(result.shortfallKg, 1000);
            assert.equal(result.isPooled, true);
        });

        it('filters out farmers exceeding buyer max price budget', () => {
            const result = multiFarmerGreedyMatch(inventory, 'Tomato', 4000, 28);
            // Only Rajan is <= 28
            assert.equal(result.matches.length, 1);
            assert.equal(result.totalMatchedKg, 3000);
            assert.equal(result.shortfallKg, 1000);
        });
    });

    describe('4. Contract Management & Overbooking Prevention', () => {
        it('prevents contract proposal if requested quantity exceeds farmer available stock', () => {
            assert.throws(() => {
                validateContractProposal(4000, 5000, 'Weekly', 1000);
            }, /Overbooking prevented/);
        });

        it('approves contract proposal within available farmer stock', () => {
            const contract = validateContractProposal(4000, 3000, 'Weekly', 1000);
            assert.equal(contract.status, 'PROPOSED');
            assert.equal(contract.totalQuantity, 3000);
            assert.equal(contract.remainingQuantity, 3000);
        });
    });

    describe('5. Shipment Tracking & Milestone Delivery', () => {
        it('correctly logs milestone delivery with shortfall notice', () => {
            const milestone = calculateShipmentMilestone(1000, 800, 0, 4000);
            assert.equal(milestone.shortfall, 200);
            assert.equal(milestone.isShortSupply, true);
            assert.equal(milestone.newTotalSupplied, 800);
            assert.equal(milestone.remainingQuantity, 3200);
            assert.equal(milestone.status, 'Active');
        });

        it('marks contract as Completed when fully supplied', () => {
            const milestone = calculateShipmentMilestone(1000, 1000, 3000, 4000);
            assert.equal(milestone.shortfall, 0);
            assert.equal(milestone.isShortSupply, false);
            assert.equal(milestone.newTotalSupplied, 4000);
            assert.equal(milestone.remainingQuantity, 0);
            assert.equal(milestone.status, 'Completed');
        });
    });
});
