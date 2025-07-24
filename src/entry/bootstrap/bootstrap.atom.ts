import { atom } from "jotai";


interface IBootStrapState {
    state: "Loading" | "Done" | "Fatal" | "TrackPlayerError"
    reason?: Error,
}
const bootstrapAtom = atom<IBootStrapState>({
    state: "Loading",
});

export default bootstrapAtom;