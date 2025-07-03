import React from "react";
import components from "./components";
import { dialogInfoStore } from "./useDialog";

export default function () {
    const dialogInfoState = dialogInfoStore.useValue();

    const Component = dialogInfoState.name
        ? components[dialogInfoState.name]
        : null;

    return (
        Component ? (
            <Component {...(dialogInfoState.payload ?? {})} />
        ) : null
    );
}
