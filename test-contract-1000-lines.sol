// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * Test Contract with 1000+ lines - Clean Math Registry
 * Pure helper functions and view getters - no vulnerabilities
 * Used to test audit endpoint capacity
 */

library MathHelpers {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }

    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "Subtraction underflow");
        return a - b;
    }

    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) return 0;
        uint256 c = a * b;
        require(c / a == b, "Multiplication overflow");
        return c;
    }

    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0, "Division by zero");
        return a / b;
    }

    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0, "Modulo by zero");
        return a % b;
    }

    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function average(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a & b) + (a ^ b) / 2;
    }

    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    function power(uint256 base, uint256 exponent) internal pure returns (uint256) {
        if (exponent == 0) return 1;
        uint256 result = 1;
        for (uint256 i = 0; i < exponent; i++) {
            result = mul(result, base);
        }
        return result;
    }

    function gcd(uint256 a, uint256 b) internal pure returns (uint256) {
        while (b != 0) {
            uint256 temp = b;
            b = a % b;
            a = temp;
        }
        return a;
    }

    function lcm(uint256 a, uint256 b) internal pure returns (uint256) {
        return div(mul(a, b), gcd(a, b));
    }

    function abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }

    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    function mulDiv(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256) {
        uint256 prod0;
        uint256 prod1;
        assembly {
            let mm := mulmod(x, y, not(0))
            prod0 := mul(x, y)
            prod1 := sub(sub(mm, prod0), lt(mm, prod0))
        }

        if (prod1 == 0) {
            return prod0 / denominator;
        }

        require(denominator > prod1, "Math overflow");

        uint256 remainder;
        assembly {
            remainder := mulmod(x, y, denominator)
        }

        assembly {
            prod1 := sub(prod1, gt(remainder, prod0))
            prod0 := sub(prod0, remainder)
        }

        uint256 twos = denominator & (~denominator + 1);
        assembly {
            denominator := div(denominator, twos)
            prod0 := div(prod0, twos)
            twos := add(div(sub(0, twos), twos), 1)
        }

        prod0 |= prod1 * twos;

        uint256 inverse = (3 * denominator) ^ 2;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;

        return prod0 * inverse;
    }
}

contract DataRegistry {
    struct Record {
        uint256 id;
        string name;
        address owner;
        uint256 value;
        uint256 timestamp;
        bool active;
    }

    struct Metadata {
        string key;
        string value;
        uint256 version;
    }

    struct Category {
        uint256 categoryId;
        string categoryName;
        uint256 recordCount;
        bool enabled;
    }

    mapping(uint256 => Record) private records;
    mapping(address => uint256[]) private ownerRecords;
    mapping(uint256 => Metadata[]) private recordMetadata;
    mapping(uint256 => Category) private categories;
    mapping(string => uint256) private nameToId;

    uint256 private recordCounter;
    uint256 private categoryCounter;

    event RecordCreated(uint256 indexed id, address indexed owner, string name);
    event RecordUpdated(uint256 indexed id, uint256 newValue);
    event CategoryCreated(uint256 indexed categoryId, string name);

    function getRecord(uint256 id) external view returns (
        uint256,
        string memory,
        address,
        uint256,
        uint256,
        bool
    ) {
        Record memory r = records[id];
        return (r.id, r.name, r.owner, r.value, r.timestamp, r.active);
    }

    function getRecordName(uint256 id) external view returns (string memory) {
        return records[id].name;
    }

    function getRecordOwner(uint256 id) external view returns (address) {
        return records[id].owner;
    }

    function getRecordValue(uint256 id) external view returns (uint256) {
        return records[id].value;
    }

    function getRecordTimestamp(uint256 id) external view returns (uint256) {
        return records[id].timestamp;
    }

    function isRecordActive(uint256 id) external view returns (bool) {
        return records[id].active;
    }

    function getOwnerRecordCount(address owner) external view returns (uint256) {
        return ownerRecords[owner].length;
    }

    function getOwnerRecordAt(address owner, uint256 index) external view returns (uint256) {
        require(index < ownerRecords[owner].length, "Index out of bounds");
        return ownerRecords[owner][index];
    }

    function getMetadataCount(uint256 recordId) external view returns (uint256) {
        return recordMetadata[recordId].length;
    }

    function getMetadataAt(uint256 recordId, uint256 index) external view returns (
        string memory,
        string memory,
        uint256
    ) {
        require(index < recordMetadata[recordId].length, "Index out of bounds");
        Metadata memory m = recordMetadata[recordId][index];
        return (m.key, m.value, m.version);
    }

    function getCategory(uint256 categoryId) external view returns (
        uint256,
        string memory,
        uint256,
        bool
    ) {
        Category memory c = categories[categoryId];
        return (c.categoryId, c.categoryName, c.recordCount, c.enabled);
    }

    function getCategoryName(uint256 categoryId) external view returns (string memory) {
        return categories[categoryId].categoryName;
    }

    function getCategoryRecordCount(uint256 categoryId) external view returns (uint256) {
        return categories[categoryId].recordCount;
    }

    function isCategoryEnabled(uint256 categoryId) external view returns (bool) {
        return categories[categoryId].enabled;
    }

    function getRecordIdByName(string memory name) external view returns (uint256) {
        return nameToId[name];
    }

    function getTotalRecords() external view returns (uint256) {
        return recordCounter;
    }

    function getTotalCategories() external view returns (uint256) {
        return categoryCounter;
    }

    function computeRecordHash(uint256 id) external view returns (bytes32) {
        Record memory r = records[id];
        return keccak256(abi.encodePacked(r.id, r.name, r.owner, r.value, r.timestamp));
    }

    function computeMetadataHash(uint256 recordId, uint256 index) external view returns (bytes32) {
        require(index < recordMetadata[recordId].length, "Index out of bounds");
        Metadata memory m = recordMetadata[recordId][index];
        return keccak256(abi.encodePacked(m.key, m.value, m.version));
    }

    function computeCategoryHash(uint256 categoryId) external view returns (bytes32) {
        Category memory c = categories[categoryId];
        return keccak256(abi.encodePacked(c.categoryId, c.categoryName, c.recordCount));
    }

    function isValidRecordId(uint256 id) external view returns (bool) {
        return records[id].id != 0;
    }

    function isValidCategoryId(uint256 categoryId) external view returns (bool) {
        return categories[categoryId].categoryId != 0;
    }

    function getRecordAge(uint256 id) external view returns (uint256) {
        require(records[id].timestamp > 0, "Record does not exist");
        return block.timestamp - records[id].timestamp;
    }

    function compareRecordValues(uint256 id1, uint256 id2) external view returns (int256) {
        uint256 v1 = records[id1].value;
        uint256 v2 = records[id2].value;
        if (v1 > v2) return 1;
        if (v1 < v2) return -1;
        return 0;
    }

    function getMaxRecordValue(uint256[] calldata ids) external view returns (uint256) {
        require(ids.length > 0, "Empty array");
        uint256 maxVal = records[ids[0]].value;
        for (uint256 i = 1; i < ids.length; i++) {
            uint256 val = records[ids[i]].value;
            if (val > maxVal) {
                maxVal = val;
            }
        }
        return maxVal;
    }

    function getMinRecordValue(uint256[] calldata ids) external view returns (uint256) {
        require(ids.length > 0, "Empty array");
        uint256 minVal = records[ids[0]].value;
        for (uint256 i = 1; i < ids.length; i++) {
            uint256 val = records[ids[i]].value;
            if (val < minVal) {
                minVal = val;
            }
        }
        return minVal;
    }

    function getAverageRecordValue(uint256[] calldata ids) external view returns (uint256) {
        require(ids.length > 0, "Empty array");
        uint256 sum = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            sum += records[ids[i]].value;
        }
        return sum / ids.length;
    }

    function getSumRecordValues(uint256[] calldata ids) external view returns (uint256) {
        uint256 sum = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            sum += records[ids[i]].value;
        }
        return sum;
    }

    function countActiveRecords(uint256[] calldata ids) external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (records[ids[i]].active) {
                count++;
            }
        }
        return count;
    }

    function countInactiveRecords(uint256[] calldata ids) external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (!records[ids[i]].active) {
                count++;
            }
        }
        return count;
    }

    function filterActiveRecords(uint256[] calldata ids) external view returns (uint256[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (records[ids[i]].active) {
                activeCount++;
            }
        }

        uint256[] memory activeIds = new uint256[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (records[ids[i]].active) {
                activeIds[index] = ids[i];
                index++;
            }
        }

        return activeIds;
    }

    function filterInactiveRecords(uint256[] calldata ids) external view returns (uint256[] memory) {
        uint256 inactiveCount = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (!records[ids[i]].active) {
                inactiveCount++;
            }
        }

        uint256[] memory inactiveIds = new uint256[](inactiveCount);
        uint256 index = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (!records[ids[i]].active) {
                inactiveIds[index] = ids[i];
                index++;
            }
        }

        return inactiveIds;
    }

    function getRecordsByOwner(address owner) external view returns (uint256[] memory) {
        return ownerRecords[owner];
    }

    function getRecordValuesByOwner(address owner) external view returns (uint256[] memory) {
        uint256[] memory ids = ownerRecords[owner];
        uint256[] memory values = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            values[i] = records[ids[i]].value;
        }
        return values;
    }

    function getTotalValueByOwner(address owner) external view returns (uint256) {
        uint256[] memory ids = ownerRecords[owner];
        uint256 total = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            total += records[ids[i]].value;
        }
        return total;
    }

    function getActiveRecordsByOwner(address owner) external view returns (uint256[] memory) {
        uint256[] memory allIds = ownerRecords[owner];
        uint256 activeCount = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (records[allIds[i]].active) {
                activeCount++;
            }
        }

        uint256[] memory activeIds = new uint256[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (records[allIds[i]].active) {
                activeIds[index] = allIds[i];
                index++;
            }
        }

        return activeIds;
    }

    function recordExists(uint256 id) external view returns (bool) {
        return records[id].id != 0;
    }

    function categoryExists(uint256 categoryId) external view returns (bool) {
        return categories[categoryId].categoryId != 0;
    }

    function isRecordOwnedBy(uint256 id, address owner) external view returns (bool) {
        return records[id].owner == owner;
    }

    function getRecordsByValueRange(uint256 minValue, uint256 maxValue, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 value = records[ids[i]].value;
            if (value >= minValue && value <= maxValue) {
                count++;
            }
        }

        uint256[] memory filtered = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 value = records[ids[i]].value;
            if (value >= minValue && value <= maxValue) {
                filtered[index] = ids[i];
                index++;
            }
        }

        return filtered;
    }

    function getRecordsByTimestampRange(uint256 startTime, uint256 endTime, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 timestamp = records[ids[i]].timestamp;
            if (timestamp >= startTime && timestamp <= endTime) {
                count++;
            }
        }

        uint256[] memory filtered = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 timestamp = records[ids[i]].timestamp;
            if (timestamp >= startTime && timestamp <= endTime) {
                filtered[index] = ids[i];
                index++;
            }
        }

        return filtered;
    }

    function computeBatchHash(uint256[] calldata ids) external view returns (bytes32) {
        bytes memory data;
        for (uint256 i = 0; i < ids.length; i++) {
            Record memory r = records[ids[i]];
            data = abi.encodePacked(data, r.id, r.name, r.owner, r.value);
        }
        return keccak256(data);
    }

    function getAllRecordHashes(uint256[] calldata ids) external view returns (bytes32[] memory) {
        bytes32[] memory hashes = new bytes32[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            Record memory r = records[ids[i]];
            hashes[i] = keccak256(abi.encodePacked(r.id, r.name, r.owner, r.value, r.timestamp));
        }
        return hashes;
    }

    function compareRecords(uint256 id1, uint256 id2) external view returns (bool) {
        Record memory r1 = records[id1];
        Record memory r2 = records[id2];
        return (
            r1.value == r2.value &&
            r1.active == r2.active &&
            keccak256(bytes(r1.name)) == keccak256(bytes(r2.name))
        );
    }

    function getOldestRecord(uint256[] calldata ids) external view returns (uint256) {
        require(ids.length > 0, "Empty array");
        uint256 oldestId = ids[0];
        uint256 oldestTimestamp = records[ids[0]].timestamp;

        for (uint256 i = 1; i < ids.length; i++) {
            uint256 timestamp = records[ids[i]].timestamp;
            if (timestamp < oldestTimestamp) {
                oldestTimestamp = timestamp;
                oldestId = ids[i];
            }
        }

        return oldestId;
    }

    function getNewestRecord(uint256[] calldata ids) external view returns (uint256) {
        require(ids.length > 0, "Empty array");
        uint256 newestId = ids[0];
        uint256 newestTimestamp = records[ids[0]].timestamp;

        for (uint256 i = 1; i < ids.length; i++) {
            uint256 timestamp = records[ids[i]].timestamp;
            if (timestamp > newestTimestamp) {
                newestTimestamp = timestamp;
                newestId = ids[i];
            }
        }

        return newestId;
    }

    function getMostValuableRecord(uint256[] calldata ids) external view returns (uint256) {
        require(ids.length > 0, "Empty array");
        uint256 mostValuableId = ids[0];
        uint256 highestValue = records[ids[0]].value;

        for (uint256 i = 1; i < ids.length; i++) {
            uint256 value = records[ids[i]].value;
            if (value > highestValue) {
                highestValue = value;
                mostValuableId = ids[i];
            }
        }

        return mostValuableId;
    }

    function getLeastValuableRecord(uint256[] calldata ids) external view returns (uint256) {
        require(ids.length > 0, "Empty array");
        uint256 leastValuableId = ids[0];
        uint256 lowestValue = records[ids[0]].value;

        for (uint256 i = 1; i < ids.length; i++) {
            uint256 value = records[ids[i]].value;
            if (value < lowestValue) {
                lowestValue = value;
                leastValuableId = ids[i];
            }
        }

        return leastValuableId;
    }

    function countRecordsByValue(uint256 targetValue, uint256[] calldata ids) external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (records[ids[i]].value == targetValue) {
                count++;
            }
        }
        return count;
    }

    function hasRecordsAboveValue(uint256 threshold, uint256[] calldata ids) external view returns (bool) {
        for (uint256 i = 0; i < ids.length; i++) {
            if (records[ids[i]].value > threshold) {
                return true;
            }
        }
        return false;
    }

    function hasRecordsBelowValue(uint256 threshold, uint256[] calldata ids) external view returns (bool) {
        for (uint256 i = 0; i < ids.length; i++) {
            if (records[ids[i]].value < threshold) {
                return true;
            }
        }
        return false;
    }

    function allRecordsActive(uint256[] calldata ids) external view returns (bool) {
        for (uint256 i = 0; i < ids.length; i++) {
            if (!records[ids[i]].active) {
                return false;
            }
        }
        return true;
    }

    function anyRecordActive(uint256[] calldata ids) external view returns (bool) {
        for (uint256 i = 0; i < ids.length; i++) {
            if (records[ids[i]].active) {
                return true;
            }
        }
        return false;
    }

    function getRecordStatistics(uint256[] calldata ids) external view returns (
        uint256 total,
        uint256 average,
        uint256 min,
        uint256 max,
        uint256 activeCount
    ) {
        require(ids.length > 0, "Empty array");

        total = 0;
        min = records[ids[0]].value;
        max = records[ids[0]].value;
        activeCount = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 value = records[ids[i]].value;
            total += value;
            if (value < min) min = value;
            if (value > max) max = value;
            if (records[ids[i]].active) activeCount++;
        }

        average = total / ids.length;

        return (total, average, min, max, activeCount);
    }

    function batchGetRecordValues(uint256[] calldata ids) external view returns (uint256[] memory) {
        uint256[] memory values = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            values[i] = records[ids[i]].value;
        }
        return values;
    }

    function batchGetRecordOwners(uint256[] calldata ids) external view returns (address[] memory) {
        address[] memory owners = new address[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            owners[i] = records[ids[i]].owner;
        }
        return owners;
    }

    function batchGetRecordTimestamps(uint256[] calldata ids) external view returns (uint256[] memory) {
        uint256[] memory timestamps = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            timestamps[i] = records[ids[i]].timestamp;
        }
        return timestamps;
    }

    function batchGetRecordStatus(uint256[] calldata ids) external view returns (bool[] memory) {
        bool[] memory statuses = new bool[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            statuses[i] = records[ids[i]].active;
        }
        return statuses;
    }

    function concatenateRecordNames(uint256[] calldata ids) external view returns (string memory) {
        string memory result = "";
        for (uint256 i = 0; i < ids.length; i++) {
            result = string(abi.encodePacked(result, records[ids[i]].name));
            if (i < ids.length - 1) {
                result = string(abi.encodePacked(result, ","));
            }
        }
        return result;
    }

    function countUniqueOwners(uint256[] calldata ids) external view returns (uint256) {
        if (ids.length == 0) return 0;

        address[] memory owners = new address[](ids.length);
        uint256 uniqueCount = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            address owner = records[ids[i]].owner;
            bool isDuplicate = false;

            for (uint256 j = 0; j < uniqueCount; j++) {
                if (owners[j] == owner) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                owners[uniqueCount] = owner;
                uniqueCount++;
            }
        }

        return uniqueCount;
    }

    function getMedianValue(uint256[] calldata ids) external view returns (uint256) {
        require(ids.length > 0, "Empty array");

        uint256[] memory values = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            values[i] = records[ids[i]].value;
        }

        for (uint256 i = 0; i < values.length; i++) {
            for (uint256 j = i + 1; j < values.length; j++) {
                if (values[i] > values[j]) {
                    uint256 temp = values[i];
                    values[i] = values[j];
                    values[j] = temp;
                }
            }
        }

        if (values.length % 2 == 0) {
            return (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
        } else {
            return values[values.length / 2];
        }
    }

    function calculatePercentile(uint256[] calldata ids, uint256 percentile) external view returns (uint256) {
        require(ids.length > 0, "Empty array");
        require(percentile <= 100, "Invalid percentile");

        uint256[] memory values = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            values[i] = records[ids[i]].value;
        }

        for (uint256 i = 0; i < values.length; i++) {
            for (uint256 j = i + 1; j < values.length; j++) {
                if (values[i] > values[j]) {
                    uint256 temp = values[i];
                    values[i] = values[j];
                    values[j] = temp;
                }
            }
        }

        uint256 index = (values.length * percentile) / 100;
        if (index >= values.length) {
            index = values.length - 1;
        }

        return values[index];
    }

    function getValueDistribution(uint256[] calldata ids, uint256 bucketSize)
        external
        view
        returns (uint256[] memory)
    {
        require(ids.length > 0, "Empty array");
        require(bucketSize > 0, "Invalid bucket size");

        uint256 maxValue = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 value = records[ids[i]].value;
            if (value > maxValue) {
                maxValue = value;
            }
        }

        uint256 bucketCount = (maxValue / bucketSize) + 1;
        uint256[] memory distribution = new uint256[](bucketCount);

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 value = records[ids[i]].value;
            uint256 bucketIndex = value / bucketSize;
            distribution[bucketIndex]++;
        }

        return distribution;
    }

    function getValueStandardDeviation(uint256[] calldata ids) external view returns (uint256) {
        require(ids.length > 0, "Empty array");

        uint256 sum = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            sum += records[ids[i]].value;
        }
        uint256 mean = sum / ids.length;

        uint256 squaredDiffSum = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 value = records[ids[i]].value;
            uint256 diff = value > mean ? value - mean : mean - value;
            squaredDiffSum += diff * diff;
        }

        uint256 variance = squaredDiffSum / ids.length;
        return MathHelpers.sqrt(variance);
    }

    function normalizeValues(uint256[] calldata ids) external view returns (uint256[] memory) {
        require(ids.length > 0, "Empty array");

        uint256 maxValue = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 value = records[ids[i]].value;
            if (value > maxValue) {
                maxValue = value;
            }
        }

        require(maxValue > 0, "Cannot normalize zero values");

        uint256[] memory normalized = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            normalized[i] = (records[ids[i]].value * 100) / maxValue;
        }

        return normalized;
    }

    function getRecordsByNamePrefix(string calldata prefix, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory)
    {
        uint256 count = 0;
        bytes memory prefixBytes = bytes(prefix);

        for (uint256 i = 0; i < ids.length; i++) {
            bytes memory nameBytes = bytes(records[ids[i]].name);
            if (nameBytes.length >= prefixBytes.length) {
                bool matches = true;
                for (uint256 j = 0; j < prefixBytes.length; j++) {
                    if (nameBytes[j] != prefixBytes[j]) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    count++;
                }
            }
        }

        uint256[] memory filtered = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            bytes memory nameBytes = bytes(records[ids[i]].name);
            if (nameBytes.length >= prefixBytes.length) {
                bool matches = true;
                for (uint256 j = 0; j < prefixBytes.length; j++) {
                    if (nameBytes[j] != prefixBytes[j]) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    filtered[index] = ids[i];
                    index++;
                }
            }
        }

        return filtered;
    }

    function getRecordNameLengths(uint256[] calldata ids) external view returns (uint256[] memory) {
        uint256[] memory lengths = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            lengths[i] = bytes(records[ids[i]].name).length;
        }
        return lengths;
    }

    function getLongestRecordName(uint256[] calldata ids) external view returns (string memory) {
        require(ids.length > 0, "Empty array");

        uint256 longestId = ids[0];
        uint256 maxLength = bytes(records[ids[0]].name).length;

        for (uint256 i = 1; i < ids.length; i++) {
            uint256 length = bytes(records[ids[i]].name).length;
            if (length > maxLength) {
                maxLength = length;
                longestId = ids[i];
            }
        }

        return records[longestId].name;
    }

    function getShortestRecordName(uint256[] calldata ids) external view returns (string memory) {
        require(ids.length > 0, "Empty array");

        uint256 shortestId = ids[0];
        uint256 minLength = bytes(records[ids[0]].name).length;

        for (uint256 i = 1; i < ids.length; i++) {
            uint256 length = bytes(records[ids[i]].name).length;
            if (length < minLength) {
                minLength = length;
                shortestId = ids[i];
            }
        }

        return records[shortestId].name;
    }

    function getAverageNameLength(uint256[] calldata ids) external view returns (uint256) {
        require(ids.length > 0, "Empty array");

        uint256 totalLength = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            totalLength += bytes(records[ids[i]].name).length;
        }

        return totalLength / ids.length;
    }

    function compareRecordNames(uint256 id1, uint256 id2) external view returns (bool) {
        return keccak256(bytes(records[id1].name)) == keccak256(bytes(records[id2].name));
    }

    function sortRecordsByValue(uint256[] calldata ids) external view returns (uint256[] memory) {
        uint256[] memory sorted = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            sorted[i] = ids[i];
        }

        for (uint256 i = 0; i < sorted.length; i++) {
            for (uint256 j = i + 1; j < sorted.length; j++) {
                if (records[sorted[i]].value > records[sorted[j]].value) {
                    uint256 temp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = temp;
                }
            }
        }

        return sorted;
    }

    function sortRecordsByTimestamp(uint256[] calldata ids) external view returns (uint256[] memory) {
        uint256[] memory sorted = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            sorted[i] = ids[i];
        }

        for (uint256 i = 0; i < sorted.length; i++) {
            for (uint256 j = i + 1; j < sorted.length; j++) {
                if (records[sorted[i]].timestamp > records[sorted[j]].timestamp) {
                    uint256 temp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = temp;
                }
            }
        }

        return sorted;
    }

    function reverseRecordOrder(uint256[] calldata ids) external pure returns (uint256[] memory) {
        uint256[] memory reversed = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            reversed[i] = ids[ids.length - 1 - i];
        }
        return reversed;
    }

    function sliceRecords(uint256[] calldata ids, uint256 start, uint256 end)
        external
        pure
        returns (uint256[] memory)
    {
        require(start < end, "Invalid range");
        require(end <= ids.length, "End out of bounds");

        uint256 length = end - start;
        uint256[] memory slice = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            slice[i] = ids[start + i];
        }

        return slice;
    }

    function deduplicateRecords(uint256[] calldata ids) external pure returns (uint256[] memory) {
        if (ids.length == 0) {
            return new uint256[](0);
        }

        uint256[] memory temp = new uint256[](ids.length);
        uint256 uniqueCount = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            bool isDuplicate = false;
            for (uint256 j = 0; j < uniqueCount; j++) {
                if (temp[j] == ids[i]) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                temp[uniqueCount] = ids[i];
                uniqueCount++;
            }
        }

        uint256[] memory unique = new uint256[](uniqueCount);
        for (uint256 i = 0; i < uniqueCount; i++) {
            unique[i] = temp[i];
        }

        return unique;
    }

    function intersectRecords(uint256[] calldata ids1, uint256[] calldata ids2)
        external
        pure
        returns (uint256[] memory)
    {
        uint256[] memory temp = new uint256[](ids1.length);
        uint256 count = 0;

        for (uint256 i = 0; i < ids1.length; i++) {
            for (uint256 j = 0; j < ids2.length; j++) {
                if (ids1[i] == ids2[j]) {
                    bool alreadyAdded = false;
                    for (uint256 k = 0; k < count; k++) {
                        if (temp[k] == ids1[i]) {
                            alreadyAdded = true;
                            break;
                        }
                    }
                    if (!alreadyAdded) {
                        temp[count] = ids1[i];
                        count++;
                    }
                    break;
                }
            }
        }

        uint256[] memory intersection = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            intersection[i] = temp[i];
        }

        return intersection;
    }

    function unionRecords(uint256[] calldata ids1, uint256[] calldata ids2)
        external
        pure
        returns (uint256[] memory)
    {
        uint256[] memory temp = new uint256[](ids1.length + ids2.length);
        uint256 count = 0;

        for (uint256 i = 0; i < ids1.length; i++) {
            temp[count] = ids1[i];
            count++;
        }

        for (uint256 i = 0; i < ids2.length; i++) {
            bool exists = false;
            for (uint256 j = 0; j < count; j++) {
                if (temp[j] == ids2[i]) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                temp[count] = ids2[i];
                count++;
            }
        }

        uint256[] memory union = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            union[i] = temp[i];
        }

        return union;
    }

    function differenceRecords(uint256[] calldata ids1, uint256[] calldata ids2)
        external
        pure
        returns (uint256[] memory)
    {
        uint256[] memory temp = new uint256[](ids1.length);
        uint256 count = 0;

        for (uint256 i = 0; i < ids1.length; i++) {
            bool existsInIds2 = false;
            for (uint256 j = 0; j < ids2.length; j++) {
                if (ids1[i] == ids2[j]) {
                    existsInIds2 = true;
                    break;
                }
            }
            if (!existsInIds2) {
                temp[count] = ids1[i];
                count++;
            }
        }

        uint256[] memory difference = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            difference[i] = temp[i];
        }

        return difference;
    }
}
