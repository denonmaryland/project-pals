// The pals mod's state: this topic's desk, for the band above the prompt.
export type DeskCounts = { pal: string; topic: string; open: number; held: number; soon: number }

declare module 'claude-code' {
  interface PluginState {
    pals: { desk: DeskCounts | null }
  }
}
