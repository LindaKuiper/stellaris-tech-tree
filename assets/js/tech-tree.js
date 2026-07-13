'use strict';

var research = ['physics', 'society', 'engineering', 'anomaly'];

var config = {
    //container: '#tech-tree-',
    rootOrientation: 'WEST', // NORTH || EAST || WEST || SOUTH
    nodeAlign: 'TOP',
    hideRootNode: true,
    siblingSeparation: 20,
    subTeeSeparation:  20,
    scrollbar: 'resize',
    connectors: {
        type: 'step'
    },
    node: {
        HTMLclass: 'tech',
        collapsable: false
    },
    callback: {
        onTreeLoaded: function(tree) {
            init_tooltips();

            var area = tree.nodeHTMLclass.replace('tech', '').replace(' ', '');
            init_nodestatus(area);

            const observer = lozad();
            observer.observe();
		}
    }
};

function init_tooltips() {

    $('.node:not(.tooltipstered)').tooltipster({
        minWidth: 300,
        // open on hover (after a short delay) as well as on click/tap
        trigger: 'custom',
        triggerOpen: { mouseenter: true, click: true, tap: true },
        triggerClose: { mouseleave: true, tap: true },
        delay: [350, 0],
        maxWidth: 512,
        functionInit: function(instance, helper){
            var content = $(helper.origin).find('.extra-data');
            $(content).find('img').each(function(img, el) {
                $(el).attr('src',$(el).attr('data-src'));
                
                var tech = $(el)[0].classList[$(el)[0].classList.length-1];
                if(!$('#' + tech).hasClass('anomaly')) {
                    var parent = $('#' + tech)[0];
                    if(parent !== undefined && parent.classList.length > 1)
                    $(el).addClass(parent.classList[2]);
                }
            });
            instance.content($('<div class="ui-tooltip">' + $(content).html() + '</div>'));
        },
        functionReady: function(instance, helper) {
            $(helper.tooltip).find('.tooltip-content').each(function(div){
                var content = $(this).html();
                content = content.replace(new RegExp(/£(\w+)£/,'g'), '<img class="resource" src="../assets/icons/$1.png" />');
                $(this).html(content);
            });
            $(helper.tooltip).find('.node-status').each(function() {
                var tech = $(this)[0].classList[1];
                if($('#' + tech).find('div.node-status').hasClass('active')) {
                    $(this).addClass('active');
                } else {
                    $(this).removeClass('active');
                }
            });
        }
    });
}

// key -> list of prerequisite keys, filled while the trees are being set up
var prereqMap = {};

function setup(tech) {
    if (tech.pseudo) {
        // Invisible spacer node used to align each tier in its own column
        $(tech.children).each(function(i, node) {
            setup(node);
        });
        return;
    }
    if (tech.key && tech.prerequisites) {
        prereqMap[tech.key] = tech.prerequisites;
    }
    var techClass = (tech.is_dangerous ? ' dangerous' : '')
        + (!tech.is_dangerous && tech.is_rare ? ' rare' : '')
        + (tech.is_event ? ' anomaly' : '');

    var tmpl = $.templates("#node-template");
    var html = tmpl.render(tech);

    tech.HTMLid = tech.key;
    tech.HTMLclass = tech.area + techClass + (tech.is_start_tech ? ' active' : '');

    var output = html;
    if(tech.is_start_tech) {
        var e = $('<div>' + html + '</div>');
        e.find('div.node-status').addClass('active').addClass('status-loaded');
        output = e.html();
    }

    tech.innerHTML = output;

    $(tech.children).each(function(i, node) {
        setup(node);
    });
};

function setup_search() {
    // Collect fresh on every search: the trees load asynchronously, so a
    // snapshot taken at page load easily misses the later trees.
    const collect_nodes = () => {
        const trees = document.querySelector('#tech-tree').querySelectorAll('.Treant');
        const nodes = Array.from(trees).reduce((a, b) => { a.push(...b.querySelectorAll('.node.tech')); return a; }, []);
        return nodes.map(b => {
            let the_text = '';
            b.querySelectorAll('.node-name, .extra-data .tooltip-content:not(.prerequisites)').forEach(data => the_text += data.textContent);
            const name_el = b.querySelector('.node-name');
            return { node: b, text: the_text, name: name_el ? name_el.textContent : '' };
        });
    };

    const debounce = (callback, wait) => {
        let timeoutId = null;
        return (...args) => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                callback.apply(null, args);
            }, wait);
        };
    };

    $('#deepsearch-clear').on('click', function() {
        $('#deepsearch').val('');
        collect_nodes().forEach(n => n.node.style.opacity = 1);
    });

    $("#deepsearch").on("change keyup paste input", debounce(function () {
        const nodes = collect_nodes();
        const search_term = $('#deepsearch').val();
        if (!search_term) {
            nodes.forEach(n => n.node.style.opacity = 1);
            return;
        }
        const term = search_term.toLowerCase();
        let first = null, firstByName = null;
        nodes.forEach(n => {
            const match = n.text.toLowerCase().includes(term);
            n.node.style.opacity = match ? 1 : 0.1;
            // only scroll to visible nodes (other tabs' trees are hidden)
            const visible = n.node.offsetParent !== null;
            if (match && visible && !first) first = n.node;
            if (!firstByName && visible && n.name.toLowerCase().includes(term)) firstByName = n.node;
        })
        // bring the best match into view - prefer a tech whose name matches
        // over one that only mentions the term in its tooltip
        const target = firstByName || first;
        if (target) {
            // no smooth behavior: the browser aborts long smooth scrolls
            target.scrollIntoView({ block: 'center', inline: 'center' });
        }
    }, 300));
};


// Hovering a tech draws temporary dashed lines from ALL of its prerequisites -
// the tree itself only shows an edge to the primary one.
function clear_prereq_lines() {
    $('#prereq-overlay').remove();
    $('.prereq-highlight').removeClass('prereq-highlight');
}

function show_prereq_lines(node) {
    clear_prereq_lines();
    var prereqs = prereqMap[node.id];
    if (!prereqs || prereqs.length === 0) return;

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.id = 'prereq-overlay';
    // fixed overlay in viewport coordinates; removed again on mouseleave/scroll
    svg.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:9000;';

    var target = node.getBoundingClientRect();
    var drawn = 0;
    prereqs.forEach(function(p) {
        var el = document.getElementById(p);
        if (!el || el.offsetParent === null) return; // prerequisite not on this page or hidden
        var r = el.getBoundingClientRect();
        if (r.width === 0) return;

        // connect the facing edges
        var fromX = r.right, toX = target.left;
        if (r.left > target.right) { fromX = r.left; toX = target.right; }

        var line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', fromX);
        line.setAttribute('y1', r.top + r.height / 2);
        line.setAttribute('x2', toX);
        line.setAttribute('y2', target.top + target.height / 2);
        line.setAttribute('stroke', '#66ccff');
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-dasharray', '7,5');
        svg.appendChild(line);

        $(el).addClass('prereq-highlight');
        drawn++;
    });
    if (drawn > 0) document.body.appendChild(svg);
}

// Clicking a tech pins its prerequisite lines so they survive scrolling and can
// be followed across the tree; the pinned lines are redrawn on every scroll frame.
// Click the same tech again (or press Escape) to unpin.
var pinnedNode = null;
var redrawScheduled = false;

function unpin_prereq_lines() {
    if (pinnedNode) $(pinnedNode).removeClass('prereq-pinned');
    pinnedNode = null;
    clear_prereq_lines();
}

function schedule_pinned_redraw() {
    if (!pinnedNode || redrawScheduled) return;
    redrawScheduled = true;
    window.requestAnimationFrame(function() {
        redrawScheduled = false;
        if (pinnedNode) show_prereq_lines(pinnedNode);
    });
}

$(document).on('mouseenter', '#tech-tree .node.tech', function() {
    if (!pinnedNode) show_prereq_lines(this);
});
$(document).on('mouseleave', '#tech-tree .node.tech', function() {
    if (!pinnedNode) clear_prereq_lines();
});
$(document).on('click', '#tech-tree .node.tech', function() {
    if (pinnedNode === this) {
        unpin_prereq_lines();
    } else {
        if (pinnedNode) $(pinnedNode).removeClass('prereq-pinned');
        pinnedNode = this;
        $(this).addClass('prereq-pinned');
        show_prereq_lines(this);
    }
});
$(document).on('keyup', function(e) {
    if (e.key === 'Escape') unpin_prereq_lines();
});
// scrolling (window or a tree container) invalidates the drawn coordinates:
// redraw when pinned, clear when only hovering
document.addEventListener('scroll', function() {
    if (pinnedNode) schedule_pinned_redraw();
    else clear_prereq_lines();
}, true);
window.addEventListener('resize', schedule_pinned_redraw);

$(document).ready(function() {
    load_tree();

    let checkExist = setInterval(() => {
        if (document.querySelector('#tech-tree')) {
           clearInterval(checkExist);
           setup_search();
        };
    }, 100)
});

function _load(jsonData, tree) {
    var container = '#tech-tree-' + jsonData.children[0].name;
    var myconfig = {container: container};
    $.extend(true, myconfig, config);

    charts[tree] = new Treant({chart:myconfig, nodeStructure: jsonData.children[0]}, function () {},$);
}

function load_tree() {
    research.forEach( area => {
        if('anomaly' !== area) {
            $.getJSON( area + '.json', function(jsonData) {
                setup(jsonData);
                _load(jsonData, area);
            });
        }
    });
    $.getJSON('anomalies.json', function(jsonData) {
        // Event techs form small chains - render them as a tree with connector
        // lines like the other pages. Rebuild parent/child links from the
        // prerequisites (the serialized children are incomplete and contain
        // duplicated copies).
        // the list contains follow-up techs twice (standalone and nested)
        const seen = new Set();
        jsonData = jsonData.filter(i => { if (seen.has(i.key)) return false; seen.add(i.key); return true; });
        const byKey = new Map(jsonData.map(i => [i.key, i]));
        jsonData.forEach(i => i.children = []);
        const hasParent = new Set();
        jsonData.forEach(item => {
            const parentKey = (item.prerequisites || []).find(p => byKey.has(p));
            if (parentKey) {
                byKey.get(parentKey).children.push(item);
                hasParent.add(item.key);
            }
        });
        const roots = jsonData.filter(item => !hasParent.has(item.key));
        // group by research area, then by name, so the layout is predictable
        roots.sort((a, b) => (a.area + ' ' + a.name).localeCompare(b.area + ' ' + b.name));

        roots.forEach(item => setup(item));
        const rootNode = { HTMLclass: 'anomalies', innerHTML: '', children: roots };
        var myconfig = { container: '#tech-tree-anomalies' };
        $.extend(true, myconfig, config);
        // the container starts hidden; Treant needs it visible to measure the layout
        const container = document.querySelector('#tech-tree-anomalies');
        const wasHidden = container.classList.contains('float-NoDisplay');
        container.classList.remove('float-NoDisplay');
        charts['anomalies'] = new Treant({ chart: myconfig, nodeStructure: rootNode }, function() {}, $);
        if (wasHidden) container.classList.add('float-NoDisplay');
    });
    if(window.indexedDB) {
        initDB();
    }
    else if (window.localStorage) {
        setupLocalStorage();
    }
}
