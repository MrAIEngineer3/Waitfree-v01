"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePatientId = void 0;
const ulid_1 = require("ulid");
const generatePatientId = () => {
    return (0, ulid_1.ulid)();
};
exports.generatePatientId = generatePatientId;
//# sourceMappingURL=id.js.map