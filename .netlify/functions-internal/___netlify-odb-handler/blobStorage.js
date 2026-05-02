"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Blobs = exports.getNormalizedBlobKey = exports.getBlobInit = exports.setBlobInit = exports.isBlobStorageAvailable = void 0;
const buffer_1 = require("buffer");
const blobs_1 = require("@netlify/blobs");
Object.defineProperty(exports, "Blobs", { enumerable: true, get: function () { return blobs_1.Blobs; } });
const isBlobStorageAvailable = async (netliBlob) => {
    try {
        // request a key that is not present. If it returns `null` then the blob storage is available
        // if it throws it's not available.
        await netliBlob.get('any-key');
        return true;
    }
    catch {
        return false;
    }
};
exports.isBlobStorageAvailable = isBlobStorageAvailable;
let blobInit;
const setBlobInit = (init) => {
    blobInit = init;
};
exports.setBlobInit = setBlobInit;
const getBlobInit = () => blobInit;
exports.getBlobInit = getBlobInit;
/**
 * @netlify/blobs ATM has some limitation to keys, so we need to normalize it for now (they will be resolved so we will be able to remove this code)
 */
const getNormalizedBlobKey = (key) => buffer_1.Buffer.from(key).toString('base64url');
exports.getNormalizedBlobKey = getNormalizedBlobKey;
