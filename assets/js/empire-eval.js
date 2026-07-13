// Empire evaluation engine (WP4).
//
// Evaluates the machine-readable weight_rules / potential_rules that ship in
// the per-version tech JSONs against the player's empire configuration
// (window.EmpireConfig) plus the set of checked technologies, then reflects the
// result on every tech node and tooltip:
//   - base -> effective weight, coloured green (up) / orange (down)
//   - per-entry status marks in the Weight Modifiers / Requirements tooltips
//   - dimming + "not available" label for techs whose requirements do not match
//
// Master switch: the engine only does anything while localStorage has an
// 'empireConfig' entry (i.e. the user has touched the Empire tab at least once).
// While inactive the site looks and behaves exactly as it did before.
//
// Data source: window.techRules[key] = { base_weight, weight_rules,
// potential_rules }, filled by setup() in tech-tree.js while the trees load.
(function () {
    'use strict';

    window.techRules = window.techRules || {};

    var STORAGE_KEY = 'empireConfig';
    var DEBOUNCE_MS = 200;

    var scheduleTimer = null;
    // per-key signature of the last applied display, so a pass only touches the
    // DOM of nodes whose result actually changed
    var lastSig = {};

    // ---- master switch -----------------------------------------------------

    function isActive() {
        try {
            return !!window.localStorage && localStorage.getItem(STORAGE_KEY) !== null;
        } catch (e) {
            return false;
        }
    }

    // ---- checked-tech tracking --------------------------------------------

    // Rebuilt from the live DOM at the start of every pass: the node has a
    // div.node-status.active when the tech is researched.
    var checkedTechs = {};

    function refreshCheckedTechs() {
        checkedTechs = {};
        var nodes = document.querySelectorAll('.node.tech');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (!el.id) continue;
            var status = el.querySelector('div.node-status');
            if (status && status.classList.contains('active')) {
                checkedTechs[el.id] = true;
            }
        }
    }

    // ---- three-valued condition evaluation --------------------------------
    // Values: true, false, or the string 'unknown'.

    var UNKNOWN = 'unknown';

    function stripAuth(v) {
        return v == null ? '' : String(v).replace(/^auth_/, '');
    }

    function authEquals(configAuthority, value) {
        if (!configAuthority) return false;
        return stripAuth(configAuthority) === stripAuth(value);
    }

    function inList(list, value) {
        return !!list && list.indexOf(value) !== -1;
    }

    function resolveFact(fact, value, cfg) {
        switch (fact) {
            case 'has_ethic':            return inList(cfg.ethics, value);
            case 'has_authority':        return authEquals(cfg.authority, value);
            case 'has_civic':            return inList(cfg.civics, value);
            case 'has_origin':           return cfg.origin === value;
            case 'has_tradition':        return inList(cfg.traditions, value);
            case 'has_ascension_perk':   return inList(cfg.ascension_perks, value);
            case 'has_trait_in_council': return inList(cfg.council_traits, value);
            case 'host_has_dlc':
                return window.EmpireConfig ? window.EmpireConfig.isDlcEnabled(value) : UNKNOWN;
            case 'has_technology':       return !!checkedTechs[value];
            case 'is_gestalt':           return inList(cfg.ethics, 'ethic_gestalt_consciousness');
            case 'is_machine_empire':    return authEquals(cfg.authority, 'machine_intelligence');
            case 'is_mechanical_empire': return authEquals(cfg.authority, 'machine_intelligence');
            case 'is_hive_empire':       return authEquals(cfg.authority, 'hive_mind');
            case 'is_megacorp':          return authEquals(cfg.authority, 'corporate');
            case 'is_regular_empire':
                return !inList(cfg.ethics, 'ethic_gestalt_consciousness') &&
                       !authEquals(cfg.authority, 'corporate');
            case 'always_false':         return false;
            default:                     return UNKNOWN;
        }
    }

    function evalCond(cond, cfg) {
        if (cond === null || cond === undefined) return true;
        if (cond.unknown !== undefined) return UNKNOWN;
        if (cond.all) return combineAll(cond.all, cfg);
        if (cond.any) return combineAny(cond.any, cfg);
        if (cond.none) return combineNone(cond.none, cfg);
        if (cond.fact !== undefined) return resolveFact(cond.fact, cond.value, cfg);
        return UNKNOWN;
    }

    function combineAll(children, cfg) {
        var sawUnknown = false;
        for (var i = 0; i < children.length; i++) {
            var v = evalCond(children[i], cfg);
            if (v === false) return false;
            if (v === UNKNOWN) sawUnknown = true;
        }
        return sawUnknown ? UNKNOWN : true;
    }

    function combineAny(children, cfg) {
        var sawUnknown = false;
        for (var i = 0; i < children.length; i++) {
            var v = evalCond(children[i], cfg);
            if (v === true) return true;
            if (v === UNKNOWN) sawUnknown = true;
        }
        return sawUnknown ? UNKNOWN : false;
    }

    function combineNone(children, cfg) {
        var sawUnknown = false;
        for (var i = 0; i < children.length; i++) {
            var v = evalCond(children[i], cfg);
            if (v === true) return false;
            if (v === UNKNOWN) sawUnknown = true;
        }
        return sawUnknown ? UNKNOWN : true;
    }

    // ---- per-tech evaluation ----------------------------------------------

    function round1(n) {
        return Math.round(n * 10) / 10;
    }

    // Returns { effective, weightStatus:[...], reqStatus:[...], available }
    function evaluateTech(rules, cfg) {
        var base = rules.base_weight;
        var weightRules = rules.weight_rules || [];
        var potRules = rules.potential_rules || [];

        var factor = 1;
        var add = 0;
        var weightStatus = new Array(weightRules.length);

        for (var i = 0; i < weightRules.length; i++) {
            var r = weightRules[i] || {};
            var hasFactor = r.factor !== null && r.factor !== undefined;
            var hasAdd = r.add !== null && r.add !== undefined;
            if (!hasFactor && !hasAdd) {
                // neutral rule (display-only) - never changes the weight
                weightStatus[i] = 'unknown';
                continue;
            }
            var v = evalCond(r.if, cfg);
            if (v === true) {
                weightStatus[i] = 'applies';
                if (hasFactor) factor *= r.factor;
                if (hasAdd) add += r.add;
            } else if (v === false) {
                weightStatus[i] = 'skipped';
            } else {
                weightStatus[i] = 'unknown';
            }
        }

        var effective = (typeof base === 'number') ? round1(base * factor + add) : base;

        var available = true;
        var reqStatus = new Array(potRules.length);
        for (var j = 0; j < potRules.length; j++) {
            var pv = evalCond(potRules[j], cfg);
            if (pv === false) {
                reqStatus[j] = 'skipped';
                available = false;
            } else if (pv === true) {
                reqStatus[j] = 'applies';
            } else {
                reqStatus[j] = 'unknown';
            }
        }

        return {
            base: base,
            effective: effective,
            weightStatus: weightStatus,
            reqStatus: reqStatus,
            available: available
        };
    }

    // ---- DOM application ---------------------------------------------------

    function numStr(n) {
        return String(n);
    }

    // Collect every rendered .node.tech, grouped by tech key (mega structures
    // can appear in more than one tree).
    function collectNodes() {
        var map = {};
        var nodes = document.querySelectorAll('.node.tech');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (!el.id) continue;
            (map[el.id] = map[el.id] || []).push(el);
        }
        return map;
    }

    function applyWeight(nodeEl, res) {
        var span = nodeEl.querySelector('.weight-value');
        if (!span) return; // tier-0 / event nodes render no weight span
        if (typeof res.base !== 'number' || typeof res.effective !== 'number') return;

        if (res.effective !== res.base) {
            span.innerHTML = numStr(res.base) +
                ' <span class="weight-arrow">→</span> ' + numStr(res.effective);
            if (res.effective > res.base) {
                span.classList.add('weight-up');
                span.classList.remove('weight-down');
            } else {
                span.classList.add('weight-down');
                span.classList.remove('weight-up');
            }
        } else {
            // equal: restore the plain base number only if we had altered it
            if (span.classList.contains('weight-up') ||
                span.classList.contains('weight-down') ||
                span.querySelector('.weight-arrow')) {
                span.textContent = numStr(res.base);
                span.classList.remove('weight-up', 'weight-down');
            }
        }
    }

    var STATUS_CLASS = {
        applies: 'applies',
        skipped: 'skipped',
        unknown: 'unknown'
    };

    function applyEntryStatus(nodeEl, selector, prefix, statuses) {
        var entries = nodeEl.querySelectorAll(selector);
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var idxAttr = e.getAttribute('data-idx');
            var idx = idxAttr === null ? i : parseInt(idxAttr, 10);
            var s = statuses[idx];
            e.classList.remove(prefix + 'applies', prefix + 'skipped', prefix + 'unknown');
            if (s) e.classList.add(prefix + STATUS_CLASS[s]);
        }
    }

    function applyAvailability(nodeEl, available) {
        if (available) {
            nodeEl.classList.remove('empire-unavailable');
        } else {
            nodeEl.classList.add('empire-unavailable');
        }
    }

    // The tooltip content was cloned from .extra-data when the tooltip was first
    // initialised (init_tooltips, at tree load). Push the freshly annotated copy
    // back into the tooltipster instance so the marks show on open.
    function refreshTooltip(nodeEl) {
        if (!window.jQuery) return;
        if (!nodeEl.classList.contains('tooltipstered')) return;
        var extra = nodeEl.querySelector('.extra-data');
        if (!extra) return;
        try {
            window.jQuery(nodeEl).tooltipster(
                'content',
                window.jQuery('<div class="ui-tooltip">' + extra.innerHTML + '</div>')
            );
        } catch (e) {
            // instance not ready / destroyed - ignore
        }
    }

    function sigOf(res) {
        return res.effective + '|' + res.weightStatus.join('') + '|' +
            res.reqStatus.join('') + '|' + (res.available ? 1 : 0);
    }

    function applyToNodes(nodeList, res, hasWm, hasReq) {
        for (var i = 0; i < nodeList.length; i++) {
            var nodeEl = nodeList[i];
            applyWeight(nodeEl, res);
            if (hasWm) applyEntryStatus(nodeEl, '.wm-entry', 'wm-', res.weightStatus);
            if (hasReq) applyEntryStatus(nodeEl, '.req-entry', 'req-', res.reqStatus);
            applyAvailability(nodeEl, res.available);
            if (hasWm || hasReq) refreshTooltip(nodeEl);
        }
    }

    // ---- full evaluation pass ---------------------------------------------

    function run() {
        scheduleTimer = null;

        var nodeMap = collectNodes();

        if (!isActive()) {
            clearAll(nodeMap);
            return;
        }

        var cfg = window.EmpireConfig ? window.EmpireConfig.get() : null;
        if (!cfg) return;

        refreshCheckedTechs();

        var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
        var touched = 0;

        for (var key in window.techRules) {
            if (!Object.prototype.hasOwnProperty.call(window.techRules, key)) continue;
            var nodeList = nodeMap[key];
            if (!nodeList) continue;

            var rules = window.techRules[key];
            var res = evaluateTech(rules, cfg);
            var sig = sigOf(res);
            if (lastSig[key] === sig) continue;
            lastSig[key] = sig;

            applyToNodes(nodeList, res,
                res.weightStatus.length > 0,
                res.reqStatus.length > 0);
            touched++;
        }

        var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
        window.EmpireEval._lastPassMs = t1 - t0;
        window.EmpireEval._lastPassTouched = touched;
    }

    // Reset every engine-applied change back to the baseline look (used when the
    // config is removed entirely, i.e. the master switch turns off).
    function clearAll(nodeMap) {
        var any = false;
        for (var key in lastSig) {
            if (!Object.prototype.hasOwnProperty.call(lastSig, key)) continue;
            any = true;
            break;
        }
        if (!any) return;

        nodeMap = nodeMap || collectNodes();
        for (var k in lastSig) {
            if (!Object.prototype.hasOwnProperty.call(lastSig, k)) continue;
            var nodeList = nodeMap[k];
            if (!nodeList) continue;
            var rules = window.techRules[k];
            var base = rules ? rules.base_weight : null;
            for (var i = 0; i < nodeList.length; i++) {
                var nodeEl = nodeList[i];
                var span = nodeEl.querySelector('.weight-value');
                if (span && typeof base === 'number') {
                    span.textContent = numStr(base);
                    span.classList.remove('weight-up', 'weight-down');
                }
                clearEntryStatus(nodeEl, '.wm-entry', 'wm-');
                clearEntryStatus(nodeEl, '.req-entry', 'req-');
                nodeEl.classList.remove('empire-unavailable');
                refreshTooltip(nodeEl);
            }
        }
        lastSig = {};
    }

    function clearEntryStatus(nodeEl, selector, prefix) {
        var entries = nodeEl.querySelectorAll(selector);
        for (var i = 0; i < entries.length; i++) {
            entries[i].classList.remove(prefix + 'applies', prefix + 'skipped', prefix + 'unknown');
        }
    }

    // ---- scheduling --------------------------------------------------------

    function schedule() {
        if (scheduleTimer) clearTimeout(scheduleTimer);
        scheduleTimer = setTimeout(run, DEBOUNCE_MS);
    }

    window.EmpireEval = {
        schedule: schedule,
        // exposed for manual/testing use
        runNow: run,
        _lastPassMs: null,
        _lastPassTouched: 0
    };

    // Re-evaluate whenever the empire configuration changes.
    if (window.EmpireConfig && window.EmpireConfig.onChange) {
        window.EmpireConfig.onChange(function () { schedule(); });
    }

    // Backstop: if a config already exists at load time, run once the DOM is up.
    if (window.jQuery) {
        window.jQuery(function () { schedule(); });
    }
})();
