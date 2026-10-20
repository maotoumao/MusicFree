import React from "react";

/** Load the UI bootstrap only when an Activity actually renders the root. */
export default function NativeRoot() {
    const Pages = require("./index").default;
    return <Pages />;
}
