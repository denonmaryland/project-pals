// The pals mod's state: this topic's desk, for the band above the prompt; which work-timeline
// steps are opened, and the finished turns' step counts (for the closing line).
// One finished main-loop turn: how long it took, how many tool calls, when it ended.
export type TurnSteps = { ms: number; steps: number; at: number }

export type DeskCounts = { pal: string; topic: string; open: number; held: number; soon: number }

declare module 'claude-code' {
  interface PluginState {
    pals: {
      desk: DeskCounts | null
      stepOpen: StateFamily<boolean>
      turns: Shaped<TurnSteps[]>
    }
  }
}
