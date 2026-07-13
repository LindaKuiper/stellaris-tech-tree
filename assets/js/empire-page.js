// Builds the Empire configuration form inside #tech-tree-empire once
// empire_options.json has loaded for this game version. If the file does
// not exist (older versions), the Empire tab stays hidden - see the
// float-NoDisplay class on .float-Empire in body.html, which this script
// only ever removes on a successful fetch.
$(document).ready(function () {
    var container = $('#tech-tree-empire');
    var tabTrigger = $('.float-Empire');

    if (!container.length) {
        return;
    }

    $.getJSON('empire_options.json')
        .done(function (data) {
            buildEmpirePage(data || {});
            tabTrigger.removeClass('float-NoDisplay');
        })
        .fail(function () {
            // empire_options.json doesn't exist for this game version yet -
            // leave the tab hidden, nothing else to do.
        });

    function buildEmpirePage(options) {
        container.empty();

        container.append(
            $('<p>').addClass('empire-intro')
                .text('Configure your empire; tech weights on the other tabs adjust to it. ' +
                      'Sections you leave empty count as "not specified": conditions about them ' +
                      'show a ? mark and do not change any weights. Once you select something in ' +
                      'a section, the unselected options in it count as "my empire does not have this".')
        );

        var resetBtn = $('<button>')
            .attr('type', 'button')
            .addClass('empire-reset-btn')
            .text('Reset');
        resetBtn.on('click', function () {
            window.EmpireConfig.reset();
        });
        container.append($('<div>').addClass('empire-reset-row').append(resetBtn));

        var sections = [
            { key: 'ethics', label: 'Ethics', type: 'checkbox', list: options.ethics },
            { key: 'authority', label: 'Authority', type: 'radio', list: options.authorities },
            { key: 'civics', label: 'Civics', type: 'checkbox', list: options.civics },
            { key: 'origin', label: 'Origin', type: 'radio', list: options.origins },
            { key: 'traditions', label: 'Traditions', type: 'checkbox', list: options.traditions },
            { key: 'council_traits', label: 'Council traits', type: 'checkbox', list: options.council_traits },
            { key: 'ascension_perks', label: 'Ascension perks', type: 'checkbox', list: options.ascension_perks },
            { key: 'dlcs', label: 'DLCs', type: 'dlc', list: options.dlcs }
        ];

        var renderers = [];

        sections.forEach(function (section) {
            if (!section.list || !section.list.length) {
                return;
            }

            var fieldset = $('<fieldset>').addClass('empire-fieldset');
            fieldset.append($('<legend>').text(section.label));
            var optionWrap = $('<div>').addClass('empire-options');
            fieldset.append(optionWrap);
            container.append(fieldset);

            if (section.type === 'checkbox') {
                renderers.push(buildCheckboxGroup(optionWrap, section));
            } else if (section.type === 'radio') {
                renderers.push(buildRadioGroup(optionWrap, section));
            } else if (section.type === 'dlc') {
                renderers.push(buildDlcGroup(optionWrap, section));
            }
        });

        function renderAll(config) {
            renderers.forEach(function (render) {
                render(config);
            });
        }

        window.EmpireConfig.onChange(renderAll);
        renderAll(window.EmpireConfig.get());
    }

    // Multi-select checkbox group (ethics, civics, traditions, council
    // traits, ascension perks). Stores an array of keys under section.key.
    function buildCheckboxGroup(wrap, section) {
        var inputs = {};

        section.list.forEach(function (entry) {
            var id = 'empire-' + section.key + '-' + entry.key;
            var input = $('<input>').attr({ type: 'checkbox', id: id, value: entry.key });
            var label = $('<label>').addClass('empire-check-label').attr('for', id)
                .append(input)
                .append(' ' + entry.name);

            input.on('change', function () {
                var current = window.EmpireConfig.get()[section.key].slice();
                var idx = current.indexOf(entry.key);
                if (input.is(':checked')) {
                    if (idx === -1) { current.push(entry.key); }
                } else if (idx !== -1) {
                    current.splice(idx, 1);
                }
                var patch = {};
                patch[section.key] = current;
                window.EmpireConfig.set(patch);
            });

            wrap.append(label);
            inputs[entry.key] = input;
        });

        return function render(config) {
            var selected = config[section.key] || [];
            Object.keys(inputs).forEach(function (key) {
                inputs[key].prop('checked', selected.indexOf(key) !== -1);
            });
        };
    }

    // Single-select radio group with an explicit "none selected" option
    // (authority, origin). Stores a single key (or null) under section.key.
    function buildRadioGroup(wrap, section) {
        var groupName = 'empire-' + section.key;
        var inputs = {};

        var noneId = groupName + '-none';
        var noneInput = $('<input>').attr({ type: 'radio', id: noneId, name: groupName, value: '' });
        var noneLabel = $('<label>').addClass('empire-check-label').attr('for', noneId)
            .append(noneInput)
            .append(' None selected');
        noneInput.on('change', function () {
            var patch = {};
            patch[section.key] = null;
            window.EmpireConfig.set(patch);
        });
        wrap.append(noneLabel);
        inputs.__none__ = noneInput;

        section.list.forEach(function (entry) {
            var id = groupName + '-' + entry.key;
            var input = $('<input>').attr({ type: 'radio', id: id, name: groupName, value: entry.key });
            var label = $('<label>').addClass('empire-check-label').attr('for', id)
                .append(input)
                .append(' ' + entry.name);

            input.on('change', function () {
                var patch = {};
                patch[section.key] = entry.key;
                window.EmpireConfig.set(patch);
            });

            wrap.append(label);
            inputs[entry.key] = input;
        });

        return function render(config) {
            var current = config[section.key];
            var target = (current && inputs[current]) ? current : '__none__';
            Object.keys(inputs).forEach(function (key) {
                inputs[key].prop('checked', key === target);
            });
        };
    }

    // DLCs are stored inverted (dlcs_disabled) so that newly-added DLCs
    // default to enabled. All checkboxes start checked.
    function buildDlcGroup(wrap, section) {
        var inputs = {};

        section.list.forEach(function (entry) {
            var id = 'empire-dlc-' + entry.key;
            var input = $('<input>').attr({ type: 'checkbox', id: id, value: entry.key });
            var label = $('<label>').addClass('empire-check-label').attr('for', id)
                .append(input)
                .append(' ' + entry.name);

            input.on('change', function () {
                var current = window.EmpireConfig.get().dlcs_disabled.slice();
                var idx = current.indexOf(entry.key);
                if (input.is(':checked')) {
                    if (idx !== -1) { current.splice(idx, 1); }
                } else if (idx === -1) {
                    current.push(entry.key);
                }
                window.EmpireConfig.set({ dlcs_disabled: current });
            });

            wrap.append(label);
            inputs[entry.key] = input;
        });

        return function render() {
            Object.keys(inputs).forEach(function (key) {
                inputs[key].prop('checked', window.EmpireConfig.isDlcEnabled(key));
            });
        };
    }
});
