"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDateInput = parseDateInput;
function parseDateInput(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid date");
    }
    return date;
}
//# sourceMappingURL=parse-date.js.map