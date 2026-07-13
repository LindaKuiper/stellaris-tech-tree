// Empire configuration storage + change-notification API.
//
// This file is intentionally standalone (no jQuery, no dependency on
// empire-page.js) so the tech-tree engine (tech-tree.js / tech-tracking.js)
// can read the player's empire configuration without needing the Empire
// form to be present on the page.
//
// Contract (see WP3 spec):
//   window.EmpireConfig.get()               -> full config object
//   window.EmpireConfig.set(partialOrFull)   -> merge + persist + notify
//   window.EmpireConfig.reset()              -> back to defaults + notify
//   window.EmpireConfig.isDlcEnabled(key)    -> bool
//   window.EmpireConfig.onChange(cb)         -> cb(config) after each change
(function () {
    'use strict';

    var STORAGE_KEY = 'empireConfig';
    var DEBOUNCE_MS = 150;

    function defaultConfig() {
        return {
            ethics: [],
            authority: null,
            civics: [],
            origin: null,
            traditions: [],
            council_traits: [],
            ascension_perks: [],
            dlcs_disabled: []
        };
    }

    function readStorage() {
        try {
            return window.localStorage ? localStorage.getItem(STORAGE_KEY) : null;
        } catch (e) {
            return null;
        }
    }

    function loadConfig() {
        var config = defaultConfig();
        var raw = readStorage();
        if (!raw) {
            return config;
        }
        try {
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                Object.keys(config).forEach(function (key) {
                    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
                        config[key] = parsed[key];
                    }
                });
            }
        } catch (e) {
            // malformed localStorage contents - fall back to defaults
        }
        return config;
    }

    var currentConfig = loadConfig();
    var listeners = [];
    var debounceTimer = null;

    function persist() {
        try {
            if (window.localStorage) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(currentConfig));
            }
        } catch (e) {
            // storage unavailable/full - config still works for this session
        }
    }

    function notify() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(function () {
            debounceTimer = null;
            var snapshot = window.EmpireConfig.get();
            listeners.slice().forEach(function (cb) {
                try {
                    cb(snapshot);
                } catch (e) {
                    // a broken listener should not prevent the others from running
                }
            });
        }, DEBOUNCE_MS);
    }

    window.EmpireConfig = {
        get: function () {
            var defaults = defaultConfig();
            var out = {};
            Object.keys(defaults).forEach(function (key) {
                var val = currentConfig[key];
                if (Array.isArray(defaults[key])) {
                    out[key] = Array.isArray(val) ? val.slice() : defaults[key].slice();
                } else {
                    out[key] = (val === undefined) ? defaults[key] : val;
                }
            });
            return out;
        },

        set: function (partialOrFull) {
            if (!partialOrFull || typeof partialOrFull !== 'object') {
                return;
            }
            var defaults = defaultConfig();
            Object.keys(partialOrFull).forEach(function (key) {
                if (Object.prototype.hasOwnProperty.call(defaults, key)) {
                    currentConfig[key] = partialOrFull[key];
                }
            });
            persist();
            notify();
        },

        reset: function () {
            currentConfig = defaultConfig();
            persist();
            notify();
        },

        isDlcEnabled: function (key) {
            var disabled = currentConfig.dlcs_disabled || [];
            return disabled.indexOf(key) === -1;
        },

        onChange: function (cb) {
            if (typeof cb === 'function') {
                listeners.push(cb);
            }
        }
    };
})();
