/**
 * @local/agent-hud — Client half (v1.2).
 *
 * One ambient entry in `conversation.composer.dock`, forced onto its own row
 * ABOVE the shipped StatsPills. Three compact icon+pills, click to pop the
 * detail box:
 *   🤖 <preset>   → box: model / preset
 *   ⚓ <N>        → box: hook invocations per point + blocked decisions
 *   ✦ <N>         → box: this session's tool-call counts + failed results
 * skill/agent/hook counts fold only THIS session's log: the projection cell
 * is per-session on the Host; the Client reads it via `useProjection`.
 * Diagnostic states never hide failure: no-hook / no-data pills stay visible.
 */
window.__ModuleLoader__.load({
  id: 'dsh-hud',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const S = {
      root: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px 6px',
        flex: '0 0 100%',
        width: '100%',
        order: -1,
        padding: '2px 0 0',
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      anchor: { position: 'relative', display: 'inline-flex' },
      pill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        maxWidth: '240px',
        padding: '0 9px',
        height: '20px',
        borderRadius: '999px',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
        font: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      icon: { fontSize: '11px', lineHeight: '1', opacity: 0.9 },
      num: { color: 'var(--dsw-alias-label-primary)', fontVariantNumeric: 'tabular-nums' },
      box: {
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        minWidth: '184px',
        maxWidth: '320px',
        maxHeight: '260px',
        overflowY: 'auto',
        padding: '8px 10px',
        borderRadius: '10px',
        background: 'var(--dsw-alias-bg-overlay)',
        border: '1px solid var(--dsw-alias-border-l1)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      },
      boxRow: { display: 'flex', justifyContent: 'space-between', gap: '14px' },
      boxKey: { color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' },
      boxVal: { color: 'var(--dsw-alias-label-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
      boxEmpty: { color: 'var(--dsw-alias-label-secondary)' },
      diag: { color: 'var(--dsw-alias-state-warn-primary)' },
    };

    const ERR = { color: 'var(--dsw-alias-state-error-primary)' };

    /** rows: [key, value] or [key, value, 'err']. */
    function DetailBox({ rows, empty }) {
      return h('div', { style: S.box, role: 'dialog' },
        rows.length === 0
          ? h('div', { style: S.boxEmpty }, empty)
          : rows.map(([k, v, tone], i) =>
              h('div', { key: `${k}-${i}`, style: S.boxRow },
                h('span', { style: S.boxKey }, k),
                h('span', { style: tone === 'err' ? { ...S.boxVal, ...ERR } : S.boxVal }, v))));
    }

    /**
     * Outline icons drawn in the host pill style (viewBox 0 0 16 16,
     * size 14, stroke currentColor at 1px, fill none — same family as
     * IconGaugeOutline/IconDatabaseOutline), so the three pills read as one set.
     */
    const svgProps = {
      width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none',
      stroke: 'currentColor', strokeWidth: 1,
      strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': 'true', style: { display: 'block', flexShrink: 0 },
    };
    const dot = (cx, cy) =>
      h('circle', { cx, cy, r: 0.9, fill: 'currentColor', stroke: 'none' });
    function IconAgent() {
      return h('svg', svgProps,
        h('rect', { x: 3, y: 4.4, width: 10, height: 9.2, rx: 2.4 }),
        h('path', { d: 'M8 4.4V2.9' }),
        h('circle', { cx: 8, cy: 2.1, r: 0.85, fill: 'currentColor', stroke: 'none' }),
        h('path', { d: 'M1.7 8.2h1.3M13 8.2h1.3' }),
        dot(6.2, 8.4), dot(9.8, 8.4),
        h('path', { d: 'M6.4 11.2h3.2' }));
    }
    function IconHook() {
      return h('svg', svgProps,
        h('circle', { cx: 8, cy: 3.2, r: 1.5 }),
        h('path', { d: 'M8 4.7v9' }),
        h('path', { d: 'M5.3 7h5.4' }),
        h('path', { d: 'M2.9 10.2c.4 2.4 2.4 3.6 5.1 3.6s4.7-1.2 5.1-3.6' }));
    }
    function IconSkill() {
      return h('svg', svgProps,
        h('path', { d: 'M7.2 2.5c.4 2.5 2.2 4.3 4.7 4.7-2.5.4-4.3 2.2-4.7 4.7-.4-2.5-2.2-4.3-4.7-4.7 2.5-.4 4.3-2.2 4.7-4.7Z' }),
        h('path', { d: 'M12.9 9.9c.2 1.1.9 1.8 2 2-.9.2-1.8.9-2 2-.2-1.1-.9-1.8-2-2 1.1-.2 1.8-.9 2-2Z' }));
    }

    /**
     * Diagnostic branch: never hide failure.
     *   no-hook = slot entry got no useProjection prop (client registration/props)
     *   no-data = hook works but agentHud projection absent (Host side)
     *   no element at all = this module never registered
     */
    function Diag({ kind }) {
      return h('div', { style: S.root, 'data-agent-hud': 'diag', 'data-hud-state': kind },
        h('span', { style: { ...S.pill, cursor: 'default', ...S.diag } },
          h('span', { style: S.boxVal }, `hud ${kind}`)));
    }

    function AgentHud({ useProjection }) {
      const [open, setOpen] = React.useState(null);
      React.useEffect(() => {
        if (open === null) return undefined;
        const onDown = (e) => {
          if (!e.target || !e.target.closest || !e.target.closest('[data-hud-pill]')) setOpen(null);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
          document.removeEventListener('mousedown', onDown);
          document.removeEventListener('keydown', onKey);
        };
      }, [open]);

      if (typeof useProjection !== 'function') return h(Diag, { kind: 'no-hook' });
      const hud = useProjection('agentHud');
      if (!hud) return h(Diag, { kind: 'no-data' });

      // Retired bridges (claude-code / codex dialects): the user migrated to
      // DSH native hooks, and pre-migration firings stay in the durable log.
      // Filter them from rows AND totals so the HUD reflects the live hook
      // system; history remains queryable in the session log itself.
      // Native handlerIds are script names (no :counter); the strip below is
      // a no-op for them and only collapses any legacy per-invocation form.
      const hookAgg = {};
      for (const [k, n] of Object.entries(hud.hooks || {})) {
        const raw = String(k);
        if (/^(claude-code|codex):/.test(raw)) continue;
        const key = raw.replace(/:\d+$/, '');
        hookAgg[key] = (hookAgg[key] || 0) + n;
      }
      const hookEntries = Object.entries(hookAgg).sort((a, b) => b[1] - a[1]);
      const hookTotal = hookEntries.reduce((sum, [, n]) => sum + n, 0);
      const skillEntries = Object.entries(hud.skills || {}).sort((a, b) => b[1] - a[1]);
      const skill = skillEntries.reduce((sum, [, n]) => sum + n, 0)
        || (hud.tools && hud.tools.skill) || 0;
      const agentText = hud.preset || hud.model || '—';
      const hookValue = hud.blocks ? `×${hookTotal} ⛔${hud.blocks}` : `×${hookTotal}`;

      const boxes = {
        agent: [
          ['model', hud.model || '—'],
          ['preset', hud.preset || '—'],
        ],
        hook: hookEntries
          .map(([handler, n]) => [handler, `×${n}`])
          .concat(hud.blocks ? [['blocked', `×${hud.blocks}`, 'err']] : []),
        skill: skillEntries
          .map(([name, n]) => [name, `×${n}`])
          .concat(hud.fails ? [['✗ failed', `${hud.fails}`, 'err']] : []),
      };
      const empties = { agent: '暂无 agent 信息', hook: '本 session 还没有 hook 调用', skill: '本 session 还没有调用 skill' };

      const pill = (id, IconCmp, value, title, label) =>
        h('span', { key: id, style: S.anchor, 'data-hud-pill': id },
          h('button', {
            type: 'button',
            style: S.pill,
            'aria-expanded': open === id,
            title,
            onClick: () => setOpen(open === id ? null : id),
          },
            h(IconCmp),
            h('span', { style: S.key }, label),
            h('span', { style: S.num }, value)),
          open === id ? h(DetailBox, { rows: boxes[id], empty: empties[id] }) : null);

      return h('div', { style: S.root, 'data-agent-hud': 'ok', 'data-hud-state': 'ok' },
        pill('agent', IconAgent, agentText, `agent · ${[hud.preset, hud.model].filter(Boolean).join(' · ') || '—'}`, 'agent'),
        pill('hook', IconHook, hookValue, `hook ×${hookTotal}${hud.blocks ? ` · ⛔ ${hud.blocks}` : ''} · 点击看明细`, 'hook'),
        pill('skill', IconSkill, `×${skill}`, `skill ×${skill}${hud.fails ? ` · ✗ ${hud.fails}` : ''} · 点击看明细`, 'skill'),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // The composer dock (ui-conversation CSS module, hashed class
        // `…_dock`) is a nowrap flex row — without wrap, a 100%-basis entry
        // would squeeze the shipped stats pills instead of getting its own
        // line above them. The hash changes with a ui-conversation rebuild,
        // in which case this selector matches nothing and the HUD degrades
        // back to one row (never breaks rendering).
        const style = document.createElement('style');
        style.textContent = '[class~="uV2eYG_dock"] { flex-wrap: wrap !important; }';
        document.head.appendChild(style);
        try {
          ctx.effect(function* () {
            yield () => style.remove();
          });
        } catch (err) {
          console.warn('[agent-hud] style cleanup not registered:', err);
        }
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
          { name: 'conversation.composer.dock', id: 'agent-hud', order: -10, label: 'Agent HUD' },
          AgentHud,
        ));
      },
    };
  },
});
