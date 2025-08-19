"use strict";
/*
  Christian Larsen, 2025
  "RPG structure"
  dspf-edit.model.ts
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.attributesFileLevel = exports.fieldsPerRecords = exports.records = exports.fileSizeAttributes = void 0;
exports.getDefaultSize = getDefaultSize;
exports.getRecordSize = getRecordSize;
exports.getAllRecordSizes = getAllRecordSizes;
;
;
;
;
;
;
;
;
;
;
;
;
;
/** Global storage for file size attributes */
exports.fileSizeAttributes = {
    numDsply: 0,
    maxRow1: 0,
    maxCol1: 0,
    nameDsply1: '',
    maxRow2: 0,
    maxCol2: 0,
    nameDsply2: ''
};
;
;
;
// GLOBAL DATA ARRAYS
exports.records = [];
exports.fieldsPerRecords = [];
exports.attributesFileLevel = [];
// UTILITY FUNCTIONS
/**
 * Get the default display size from the global file size attributes.
 */
function getDefaultSize() {
    return {
        rows: exports.fileSizeAttributes.maxRow1,
        cols: exports.fileSizeAttributes.maxCol1,
        name: exports.fileSizeAttributes.nameDsply1,
        source: 'default',
        originCol: 1,
        originRow: 1
    };
}
;
/**
 * Get the size information for a specific record by name.
 * @param recordName - Name of the record to find.
 */
function getRecordSize(recordName) {
    const recordEntry = exports.fieldsPerRecords.find(r => r.record === recordName);
    return recordEntry?.size;
}
;
/**
 * Get all records that have size information.
 */
function getAllRecordSizes() {
    return exports.fieldsPerRecords
        .filter(r => r.size)
        .map(r => ({ record: r.record, size: r.size }));
}
;
//# sourceMappingURL=dspf-edit.model.js.map