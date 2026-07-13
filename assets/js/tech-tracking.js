// Add ability to track node status
var charts = {};

// In-page notification that stays readable (native alerts were too fleeting)
function showToast(message, isError) {
    var holder = document.getElementById('toast-holder');
    if (!holder) { alert(message); return; }
    var toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' toast-error' : '');
    toast.textContent = message;
    holder.appendChild(toast);
    setTimeout(function() {
        toast.classList.add('fade-out');
        setTimeout(function() { toast.remove(); }, 700);
    }, 4000);
}

// Invisible pseudo spacer nodes (tier alignment) sit between real techs in the
// Treant tree - resolve through them when walking parents/children.
function realParentNode(area, node) {
    var parent = undefined !== node.parentId ? charts[area].tree.nodeDB.db[node.parentId] : undefined;
    while (parent && parent.pseudo && undefined !== parent.parentId) {
        parent = charts[area].tree.nodeDB.db[parent.parentId];
    }
    return parent;
}

function realChildNodes(area, node, acc) {
    acc = acc || [];
    if (undefined === node.children) return acc;
    for (const childId of node.children) {
        var child = charts[area].tree.nodeDB.db[childId];
        if (child.pseudo) realChildNodes(area, child, acc);
        else acc.push(child);
    }
    return acc;
}

// All connector segments between this node and its real parent (through pseudo nodes)
function incomingConnectors(area, node) {
    var list = [];
    if (node.connector) list.push(node.connector);
    var parent = undefined !== node.parentId ? charts[area].tree.nodeDB.db[node.parentId] : undefined;
    while (parent && parent.pseudo) {
        if (parent.connector) list.push(parent.connector);
        // Treant draws a separate "line through" path across each pseudo node -
        // without it only the short joints between pseudo nodes get colored
        if (parent.lineThroughMe) list.push(parent.lineThroughMe);
        parent = undefined !== parent.parentId ? charts[area].tree.nodeDB.db[parent.parentId] : undefined;
    }
    return list;
}

// Reverse of prereqMap (tech-tree.js): for each tech, the techs that list it
// as a prerequisite. Built lazily because prereqMap fills while trees load.
var dependentsMap = null;

function getDependents(key) {
    if (dependentsMap === null && window.prereqMap) {
        dependentsMap = {};
        for (var k in prereqMap) {
            prereqMap[k].forEach(function(p) {
                (dependentsMap[p] = dependentsMap[p] || []).push(k);
            });
        }
    }
    return (dependentsMap && dependentsMap[key]) || [];
}

function findChartArea(name) {
    for (const tree in charts) {
        if (charts[tree].tree.nodeDB.db.some(function(n) { return n.nodeHTMLid === name; })) return tree;
    }
    return null;
}

// Remove every check mark in one go (starting techs stay checked - they are
// always researched). Bound here; the button lives in the toolbar.
$(document).on('click', '#research_clear', function(event) {
    event.preventDefault();
    if(!window.confirm('Remove ALL research check marks?')) return;

    var cleared = 0;
    research.forEach(function(area) {
        if('anomaly' === area) return;
        $('#tech-tree-' + area + ' div.node-status.active').parent().each(function() {
            if($(this).find('.node-title').text().indexOf('Starting') >= 0) return;
            updateResearch(area, $(this).attr('id'), false);
            cleared++;
        });
    });
    // anomaly/event techs toggle independently of the trees
    $('#tech-tree-anomalies .node-status.active').each(function() {
        $(this).removeClass('active');
        $(this).parent().removeClass('active');
        cleared++;
    });
    showToast(cleared > 0 ? 'Cleared ' + cleared + ' research check marks.' : 'No research check marks to clear.');
});

// Colored connectors must be raised above overlapping uncolored ones,
// otherwise long lines only show their color where nothing crosses them
function colorConnector(conn, cls, add) {
    var el = conn.node || conn[0];
    if (add) {
        $(el).addClass(cls);
        if (conn.toFront) conn.toFront();
    } else {
        $(el).removeClass(cls);
    }
}

function init_nodestatus(area) {
    $('#tech-tree-' + area).find('.node div.node-status:not(.status-loaded)').each(function() {
        var events = $._data($( this )[0], "events");

        if(undefined === events || undefined === events.click) {
            $(this).on('click', function toggle_status() {
                // Find chart for the research
                if($(this).parent().hasClass('anomaly')) {
                    if($(this).hasClass('active')) {
                        $(this).removeClass('active');
                        $(this).parent().removeClass('active');
                    } else {
                        $(this).addClass('active');
                        $(this).parent().addClass('active');
                    }

                    event.stopPropagation();
                    return;
                }
                // Limmit activation to research directly under an activated parent
                var tree_node = $(this).parent().data('treenode');
                if(undefined === tree_node.parentId) {
                    return;
                }
                // If the (real, non-pseudo) parent is the root node [0], this is the first research that can be activated
                var parent = realParentNode(area, tree_node);
                if(parent && 0 < parent.id) {
                    if(!$( '#' + parent.nodeHTMLid + ' div.node-status').hasClass('active')) {
                        return;
                    }
                }
                // Check for any other prerequisites
                var active = true;
                $(this).parent().find('span.node-status').each(function() {
                    var tech = $(this)[0].classList[1];
                    tech = $('#' + tech).find('div.node-status');
                    if(undefined !== tech && !tech.hasClass('active')) {
                        active = false;
                    }
                });
                if(!active) return;

                var id = $( this ).parent().attr('id');
                if($(this).hasClass('active')) {
                    updateResearch(area, id, false);
                } else {
                    updateResearch(area, id, true);
                }
                event.stopPropagation();
            });
            $( this ).addClass('status-loaded');
        }
    });
}

function getNodeDBNode(area, name) {
    for(const item of charts[area].tree.nodeDB.db) {
        if(item.nodeHTMLid === name) return item;
    }
    // Didn't find in the area charts - maybe it's in another one ?
    // (see Science Nexus and other Mega Structure in Engineering tree)
    for(const tree in charts) {
        if(tree === area) continue;
        for(const item of charts[tree].tree.nodeDB.db) {
            if(item.nodeHTMLid === name) return item;
        }
    }
    return null;
}

function updateResearch(area, name, active) {
    // Check if node is already set to proper state
    if($( '#' + name + ' div.node-status').hasClass('active') == active) {
        return;
    }

    // Get the nodeDB item
    var inode = getNodeDBNode(area, name);

    if(active) {
        // Update the node-status
        $('#' + name).addClass('active');
        $('#' + name).find('.node-status').addClass('active');

        if(inode == null) return;

        incomingConnectors(area, inode).forEach(function(c) { colorConnector(c, "active", true); });

        for(const child of realChildNodes(area, inode)) {
            incomingConnectors(area, child).forEach(function(c) { colorConnector(c, area, true); });
        }

    } else {
        // Update the node-status
        $('#' + name).removeClass('active');
        $('#' + name).find('.node-status').removeClass('active');

        if(inode != null) {
            incomingConnectors(area, inode).forEach(function(c) { colorConnector(c, "active", false); });

            // For each Children update the connector
            for(const child of realChildNodes(area, inode)) {
                incomingConnectors(area, child).forEach(function(c) { colorConnector(c, area, false); });
                updateResearch(area, child.nodeHTMLid, false);
            }
        }

        // Techs that list this one as a (secondary) prerequisite can no longer be researched
        for(const dep of getDependents(name)) {
            var depStatus = $('#' + dep + ' div.node-status');
            if(depStatus.length && depStatus.hasClass('active')) {
                updateResearch(findChartArea(dep) || area, dep, false);
            }
        }

    }
}

function getInitNode(node, name) {
    for (const count in node) {
        if(name == node[count].key && undefined !== node[count].innerHTML) {
            return node[count];
        } else if(undefined !== node[count].children && 0 < node[count].children.length) {
            var childNode = getInitNode(node[count].children, name);

            if(undefined !== childNode) {
                return childNode;
            }
        }
    }
    return undefined;
}

// IndexedDB solution (Multiple research sets saved)
var offlineDB;

function initDB() {
    var request = window.indexedDB.open("researchDB");
    request.onerror = function(event) {
        showToast('Unable to store more than one set of research unless permission is approved!', true);
        if(window.localStorage) {
            setupLocalStorage();
        }
    };
    request.onsuccess = function(event) {
        offlineDB = event.target.result;
        offlineDB.onerror = function(event) {
            // Generic error handler for all errors targeted at this database's
            // requests!
            console.error("IndexedDB error: " + event.target.errorCode);
        };
        offlineDB.onupgradeneeded = function(event) {
            offlineDB.onversionchange = function(event) {
                offlineDB.close();
            };
        };
        findLists();
    };
    request.onupgradeneeded = function(event) {
        // Create an objectStore for this database
        event.currentTarget.result.createObjectStore("TreeStore", { keyPath: "name" });
    };
}

function findLists() {
    var objectStore = offlineDB.transaction("TreeStore").objectStore("TreeStore");

    var lists = [];
    objectStore.openCursor().onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
            lists.push(cursor.value);
            cursor.continue();
        }
        else {
            lists.forEach(item => {
                $('#research_list').append('<option value="' + item.name + '">' + item.name + '</option>');
            });
            $('#research_save').on('click', function(event) {
                event.preventDefault();
                if($('#research_selection').val() && $.trim($('#research_selection').val()).length !== 0) {
                    saveListToIndexedDB( $('#research_selection').val() );
                } else {
                    showToast('Cannot save: enter a name in the Research List field first.', true);
                }
            })
            $('#research_load').on('click', function(event) {
                event.preventDefault();
                if($('#research_selection').val() && $.trim($('#research_selection').val()).length !== 0) {
                    loadListFromIndexedDB( $('#research_selection').val() );
                } else {
                    showToast('Cannot load: enter the name of a saved Research List first.', true);
                }
            })
            $('#research_remove').on('click', function(event) {
                event.preventDefault();
                if($('#research_selection').val() && $.trim($('#research_selection').val()).length !== 0) {
                    removeListFromIndexedDB( $('#research_selection').val() );
                } else {
                    showToast('Cannot remove: enter the name of a saved Research List first.', true);
                }
            })
            $('.research').removeClass('hide');
        }
    };
}

function saveListToIndexedDB(name) {
    if(offlineDB) {

        var data = [];
        research.forEach(area => {
            $('.' + area + ' div.node-status.active').parent().not(':contains(\\(Starting\\))').each(function() {
                data.push({key: $(this).attr('id'), area: area});
            });
        });

        var objectStore = offlineDB.transaction(["TreeStore"], "readwrite").objectStore("TreeStore");

        var result = objectStore.put({name: name, data: data});
        result.onsuccess = function(event) {
            if(event.target.result && name == event.target.result) {
                if($('#research_list option[value="' + name + '"]').length === 0) {
                    $('#research_list').append('<option value="' + name + '">' + name + '</option>');
                }
                showToast('Research list "' + name + '" saved (' + data.length + ' techs).');
                return true;
            }
        };
        result.onerror = function(event) {
            showToast('Unable to save research list "' + name + '".', true);
        };
    } else {
        initDB();
    }
}

function loadListFromIndexedDB(name) {
    if(offlineDB) {
        var objectStore = offlineDB.transaction("TreeStore").objectStore("TreeStore");

        var result = objectStore.get(name);
        result.onsuccess = function(event) {
            if(event.target.result && event.target.result.data) {
                var data = event.target.result.data;
                research.forEach(area => {
                    $('.' + area + ' div.node-status.active').parent().not(':contains(\\(Starting\\))').each(function() {
                        updateResearch(area, $(this).attr('id'), false);
                        $(this).find('div.node-status').removeClass('active');
                    });
                });
                data.forEach(item => {
                    if('anomaly' == item.area) {
                        $('#' + item.key).addClass('active').find('div.node-status').addClass('active');
                    }
                    else {
                        updateResearch(item.area, item.key, true);
                    }
                });
                showToast('Research list "' + name + '" loaded (' + data.length + ' techs).');
            }
            else {
                showToast('Research list "' + name + '" does not exist.', true);
            }
        };
        result.onerror = function(event) {
            showToast('Unable to load research list "' + name + '".', true);
        }
    } else {
        initDB();
    }
}

function removeListFromIndexedDB(name) {
    if(offlineDB) {
        var objectStore = offlineDB.transaction(["TreeStore"], "readwrite").objectStore("TreeStore");
        var result = objectStore.delete(name);
        result.onerror = function(event) {
            showToast('Unable to remove research list "' + name + '".', true);
        };
        result.onsuccess = function(event) {
            $('option[value="' + name + '"]').remove();
            if($.trim($('#research_selection').val()) == name) {
                $('#research_selection').val('');
            }
            showToast('Research list "' + name + '" removed.');
        };
    } else {
        initDB();
    }
}

// LocalStorage solution (Single save)
function setupLocalStorage() {
    $('#research_save').on('click', function(event) {
        event.preventDefault();
        saveResearchToLocalStorage();
    }).parent().removeClass('hide');
    $('#research_load').on('click', function(event) {
        event.preventDefault();
        loadResearchFromLocalStorage();
    }).parent().removeClass('hide');
}

function saveResearchToLocalStorage() {
    var data = {};
    research.forEach(area => {
        var activeTech = [];
        $('.' + area + ' div.node-status.active').parent().not(':contains(\\(Starting\\))').each(function() {
            activeTech.push($(this).attr('id'));
        });
        data[area] = activeTech;
    });
    localStorage['LocalStorage'] = JSON.stringify(data);
}

function loadResearchFromLocalStorage() {
    if(localStorage['LocalStorage']) {
        var data = JSON.parse(localStorage['LocalStorage']);
        research.forEach(area => {
            var activeTech = data[area];
            activeTech.forEach(tech => updateResearch(area, tech, true));
            charts[area].tree.reload();
        });
    } else {
        showToast('Unable to load data from local storage!', true);
    }
}