/**
 * @local/agent-hud — Host half.
 *
 * Registers one client-visible session projection `agentHud` that folds the
 * durable log into the HUD view the Client line renders:
 *   - agent info : model (model/selection) + preset (session header)
 *   - operations : per-tool call counts (tool/call) + failed results (tool/result)
 *   - hook info  : invocations per point (hook/invoked) + blocking decisions (hook/result)
 *
 * The Client never folds events itself; it reads the computed wire view through
 * `useProjection('agentHud')` in the `conversation.composer.dock` slot entry.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * The bundle is linked from the workspace, so plain `import 'zod'` is not
 * resolvable from here. Try the profile, then the Harness install; if neither
 * is reachable, fall back to identity schemas — the registry only ever calls
 * `.parse()`, and the state is this plugin's own JSON either way.
 */
function loadZod() {
  const bases = [];
  if (process.env.DSH_PROFILE_DIR) bases.push(join(process.env.DSH_PROFILE_DIR, 'package.json'));
  bases.push('/usr/lib/node_modules/@deepseek-ai/dsh/package.json');
  for (const base of bases) {
    try {
      const mod = createRequire(base)('zod');
      if (mod && mod.z) return mod.z;
    } catch {
      /* try the next base */
    }
  }
  return null;
}
const identity = () => ({
  parse: (value) => value,
  safeParse: (value) => ({ success: true, data: value }),
});

const z = loadZod();
const countMap = z ? z.record(z.string(), z.number()) : identity();

const hudSchema = z
  ? z.object({
      model: z.string().nullable(),
      preset: z.string().nullable(),
      tools: countMap,
      fails: z.number(),
      hooks: countMap,
      skills: countMap,
      blocks: z.number(),
    })
  : identity();

/** Best-effort model display name from a `model/selection` payload. */
function modelName(selection) {
  const raw = selection && (selection.model ?? selection.modelId ?? selection.name);
  if (typeof raw === 'string') return raw || null;
  if (raw && typeof raw === 'object') {
    const nested = raw.id ?? raw.name ?? raw.model;
    return typeof nested === 'string' && nested ? nested : null;
  }
  return null;
}

export function apply(ctx) {
  console.log('[dsh-hud] host apply reached');
  // cordis: ctx.inject(deps, cb) loads cb as a nested plugin whose OWN ctx
  // argument carries the declared deps — reading ctx.sessionProjections on the
  // outer closure ctx throws "without inject" (the bug that kept the
  // projection from ever registering).
  return ctx.inject(['sessionProjections'], (sessionCtx) => {
    try {
      const dispose = sessionCtx.sessionProjections.register({
      key: 'agentHud',
      stateVersion: 2,
      stateSchema: hudSchema,
      init: (header) => ({
        model: null,
        preset: (header && (header.agentPreset ?? header.preset)) || null,
        tools: {},
        fails: 0,
        hooks: {},
        skills: {},
        blocks: 0,
      }),
      apply(state, event) {
        const data = event.data;
        switch (event.type) {
          case 'model/selection': {
            const name = modelName(data);
            return name && name !== state.model ? { ...state, model: name } : state;
          }
          case 'tool/call': {
            const name = data && data.name;
            if (typeof name !== 'string' || !name) return state;
            const tools = { ...state.tools, [name]: (state.tools[name] || 0) + 1 };
            if (name === 'skill') {
              let args = data.arguments;
              if (typeof args === 'string') {
                try { args = JSON.parse(args); } catch { args = null; }
              }
              const skillName = args && (args.name ?? args.skill);
              if (typeof skillName === 'string' && skillName) {
                return {
                  ...state,
                  tools,
                  skills: { ...state.skills, [skillName]: (state.skills[skillName] || 0) + 1 },
                };
              }
            }
            return { ...state, tools };
          }
          case 'tool/result': {
            const bad = Boolean(data && (data.error || (data.message && data.message.isError)));
            return bad ? { ...state, fails: state.fails + 1 } : state;
          }
          case 'hook/invoked': {
            // Key by handler name: the box must list WHICH hook fired —
            // point only ever said "stop ×N", which told the user nothing.
            const key = (data && (data.handlerId || data.point)) || 'unknown';
            return { ...state, hooks: { ...state.hooks, [key]: (state.hooks[key] || 0) + 1 } };
          }
          case 'hook/result': {
            const decision = data && data.decision;
            return decision === 'deny' || decision === 'stop'
              ? { ...state, blocks: state.blocks + 1 }
              : state;
          }
          default:
            return state;
        }
      },
      wire: {
        viewSchema: hudSchema,
        // Same reference as state: the registry's Object.is gate then publishes
        // exactly when the fold changed.
        view: (state) => state,
      },
    });
      console.log('[dsh-hud] projection registered key=agentHud');
      return dispose;
    } catch (error) {
      console.error('[dsh-hud] projection register failed:', error);
      throw error;
    }
  });
}
