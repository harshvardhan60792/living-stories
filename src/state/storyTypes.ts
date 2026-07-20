export type Role = "RAPPORT" | "VOLATILITY" | "PRESSURE" | "INSIGHT";
export const ROLES: Role[] = ["RAPPORT", "VOLATILITY", "PRESSURE", "INSIGHT"];
export type Band = "low" | "mid" | "high";

/** Meter values are floats in [0,100], keyed by canonical role. */
export type MeterState = Record<Role, number>;

/** A condition on state: each named role must be in the given band. */
export type BandCondition = Partial<Record<Role, Band>>;

export interface TextVariant {
  text: string;
  when?: BandCondition; // absent = default variant
}
export interface Edge {
  when?: BandCondition; // absent = always-eligible fallback
  nextId: string | null; // null = story ending
}
export interface Choice {
  id: string;
  text: string;
  toneTag?: string; // author-time hint only; runtime scores the text itself
  edges: Edge[];
}
export interface Stance {
  id: string;
  anchorPhrasings: string[]; // used by free-text routing (Plan 4)
  npcResponse: string;
  toneTag?: string;
  edges: Edge[];
}
interface BaseNode {
  id: string;
  textVariants: TextVariant[];
}
export interface ActionNode extends BaseNode {
  type: "action";
  choices: Choice[];
}
export interface DialogueNode extends BaseNode {
  type: "dialogue";
  stances: Stance[];
  fallbackStanceId: string;
}
export type StoryNode = ActionNode | DialogueNode;

export interface StoryPack {
  id: string;
  title: string;
  genre: string;
  meterLabels: Record<Role, string | null>; // null = meter hidden for this story
  startNodeId: string;
  initialState: MeterState;
  nodes: StoryNode[];
}
export interface StoryManifestEntry {
  id: string;
  title: string;
  genre: string;
  blurb: string;
}
