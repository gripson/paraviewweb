import d3 from 'd3';
import cola from 'webcola/WebCola';

import style from 'PVWStyle/InfoVizNative/InformationGraph.mcss';

import CompositeClosureHelper from '../../../Common/Core/CompositeClosureHelper';
import htmlContent from './body.html';
import iconImage from './InfoDistGraphIconSmall.png';
import multiClicker from '../../Core/D3MultiClick';

/** Compute a tree of variables given a mutual information matrix (\a mi) relating them.
  *
  * The root of the tree will be the variable with the highest entropy (self-information).
  * After the root is identified, children of existing nodes are determined
  * by finding the highest mutual information joining any node already in the
  * tree to any node not in the tree.
  *
  * Thus, the tree is a spanning tree with the shortest edges possible
  * (assuming length is proportional to mutual information).
  *
  * This method returns a dictionary whose keys are integer matrix row numbers
  * and whose values are arrays of column numbers attached to the row, such
  * that no entry in the value array is smaller than the key (e.g., if the tree
  * has root 5 and edges (5, 2), (5, 1), (2, 3), (3, 4), then the dictionary
  * will be { 1: [5], 2: [5, 3], 3: [4] }. This is done so that testing
  * whether an edge is in the tree is a fast operation.
  */
function computeVariableTree(mi) {
  // I. Find the root, r:
  const nv = mi.length;
  let r = 0;
  let ri = mi[r][r];
  for (let ii = 1; ii < nv; ++ii) {
    if (mi[ii][ii] > ri) {
      ri = mi[ii][ii];
      r = ii;
    }
  }
  console.log('Root ', r);
  // II. Find descendants.
  const nodes = new Set([r]);
  const missing = new Set();
  const tree = {};
  for (let ii = 0; ii < nv; ++ii) { if (ii != r) { missing.add(ii); } }
  while (nodes.size < nv) {
    let max = -1;
    let mrow = -1;
    let mcol = -1;
    for (const row of nodes.values()) {
      for (const col of missing.values()) {
        const vv = mi[row][col];
        if (max < vv) {
          mrow = row;
          mcol = col;
          max = vv;
        }
      }
    }
    missing.delete(mcol);
    nodes.add(mcol);
    console.log('  Add ', mrow, mcol);
    if (mrow < mcol) {
      if (!(mrow in tree)) { tree[mrow] = {}; }
      tree[mrow][mcol] = true;
    } else {
      if (!(mcol in tree)) { tree[mcol] = {}; }
      tree[mcol][mrow] = true;
    }
  }
  console.log('Tree ', tree);
  return tree;
}


/* eslint-disable no-use-before-define */

// ----------------------------------------------------------------------------
// Information Graph
// ----------------------------------------------------------------------------

function informationGraph(publicAPI, model) {
  let lastAnnotationPushed = null;

  if (!model.provider
    || !model.provider.isA('MutualInformationProvider')
    || !model.provider.isA('Histogram1DProvider')
    || !model.provider.isA('FieldProvider')) {
    console.log('Invalid provider:', model.provider);
    return;
  }

  model.clientRect = null;

  // FIXME: Make some attempt at unique id, for now just use millis timestamp
  model.instanceID = `informationGraph-${Date.now()}`;

  publicAPI.resize = () => {
    if (!model.container) {
      return; // no shirt, no shoes, no service.
    }

    model.clientRect = model.container.getBoundingClientRect();
    publicAPI.render();
  };

  publicAPI.setContainer = (el) => {
    if (model.container) {
      while (model.container.firstChild) {
        model.container.removeChild(model.container.firstChild);
      }
    }

    model.container = el;
    model.edgeSlider = 0.025;

    if (model.container) {
      // Create placeholder
      // Apply style
      const d3Container = d3
        .select(model.container)
        .html(htmlContent)
        .select('.info-graph-container')
        .classed(style.infoGraphContainer, true);

      d3Container
        .select('.show-button')
        .classed(style.showButton, true);

      d3Container
        .select('.hide-button')
        .classed(style.hideButton, true);

      d3Container
        .select('.info-graph-placeholder')
        .classed(style.infoGraphPlaceholder, true)
        .select('img')
        .attr('src', iconImage);

      /* eslint-disable prefer-arrow-callback */
      // need d3 provided 'this', below.
      d3Container
        .select('.edge-slider')
        .on('change', function updateSelectedEdges(d, i) {
          /* eslint-enable prefer-arrow-callback */
          console.log('slider now ', this.value);
          model.edgeSlider = this.value;
          publicAPI.render();
        });
    }
  };

  publicAPI.render = () => {
    // Extract provider data for local access
    const getLegend = model.provider.isA('LegendProvider') ? model.provider.getLegend : null;
    const histogram1DnumberOfBins = model.numberOfBins;
    const variableList = model.provider.getFieldNames(); // getActiveFieldNames(); // graph all/active variables.

    if (variableList.length < 1 || !model.container) {
      // Select the main circle and hide it and unhide placeholder
      d3.select(model.container).select('svg.information-graph').attr('class', style.informationGraphSvgHide);
      d3.select(model.container).select('div.info-graph-placeholder').classed(style.hidden, false);
      return;
    }

    // Guard against rendering if container is non-null but has no size (as
    // in the case when workbench layout doesn't include our container)
    if (model.clientRect === null || model.clientRect.width === 0 || model.clientRect.height === 0) {
      return;
    }

    const width = model.clientRect.width;
    const height = model.clientRect.height - 20;

    // Make sure we have all the data we need
    if (!model.mutualInformationData || !model.histogramData) {
      return;
    }

    // Update
    d3.select(model.container).select('div.info-graph-placeholder').classed(style.hidden, true);

    const d3cola = cola.d3adaptor()
      .avoidOverlaps(true)
      .linkDistance(30)
      .size([width, height]);

    // Remove previous SVG
    const old = d3.select(model.container).select('.info-graph-view').select('svg');
    if (!old.empty()) {
      old.remove();
    }

    // Setup our SVG container
    const svg = d3.select(model.container).select('.info-graph-view').append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('float', 'left')
      .attr('class', style.informationGraphSvgShow)
      .classed('information-graph', true);

    // Mouse move handling ----------------------------------------------------
    svg
      /* eslint-disable prefer-arrow-callback */
      // need d3 provided 'this', below.
      .on('mousemove', function mouseMove(d, i) {
        /* eslint-enable prefer-arrow-callback */
        const overCoords = d3.mouse(model.container);
        //const info = findGroupAndBin(overCoords);
        //console.log('mousemove', overCoords);
      }); /*
      .on('mouseout', (d, i) => {
        console.log('mouseout');
      });
      */

    const lgroup = svg.append('g').classed('links', true).classed(style.links, true);
    const ngroup = svg.append('g').classed('nodes', true).classed(style.nodes, true);

    // Convert vmap into an array:
    const vm = model.mutualInformationData.vmap;
    const nodes = Object.keys(vm).map(k => vm[k]);
    const ds = model.mutualInformationData.varinf;

    // Keep a nice minimal spanning tree around:
    const mstree = computeVariableTree(model.mutualInformationData.matrix);

    d3cola.nodes(nodes);

    let links = [];
    let linkSelection = null;
    let previousThreshold = 0.0;
    let linkId = -1;
    const quantiles = [];
    const nn = nodes.length;

    for (let ii = 0; ii < nn - 1; ++ii) {
      for (let jj = ii + 1; jj < nn; ++jj) {
        quantiles.push(model.mutualInformationData.varinf[ii][jj]);
      }
    }
    quantiles.sort((a, b) => a - b);
    console.log('Quantiles from ', quantiles[0], ' to ', quantiles[quantiles.length - 1]);

    function changeEdgeCutoff(frac) {
      const thresh = quantiles[Math.round(frac * (quantiles.length - 1))];
      console.log('Threshold ', thresh);

      if (thresh != previousThreshold) {
        // Subset links that are still valid under the new threshold:
        links = links.filter( lk => lk.length < thresh );

        // Add links that were not included previously:
        for (let ii = 0; ii < nn - 1; ++ii) {
          for (let jj = ii + 1; jj < nn; ++jj) {
            let val = model.mutualInformationData.varinf[ii][jj];
            if (
              (ii in mstree && jj in mstree[ii]) ||
              (val >= previousThreshold && val < thresh)) {
              links.push({
                source: nodes[ii],
                target: nodes[jj],
                length: val * 75,
                id: ++linkId,
              });
            }
          }
        }
        d3cola
          .links(links)
          .start(1);
        console.log('  Links ', links);
        // TODO: Disable update if there are no edges.
        previousThreshold = thresh;
        linkSelection = lgroup.selectAll('.link').data(links, lk => lk.id);
        linkSelection.exit().remove();
        updatePositions(null, linkSelection.enter().
          append('line').
          classed('link', true).
          classed(style.link, true).
          style('stroke-width', d => 3 * (1 - d.length/75.0) + 1), 0.01);
      }
    }

    function updatePositions(nodeMarks, linkMarks, duration) {
      console.log('updatePosns');
      if (typeof nodeMarks !== 'undefined' && nodeMarks) {
        nodeMarks.transition().duration(duration).attr('transform',
          d => `translate(${d.x - model.glyphSize / 2}, ${d.y - model.glyphSize / 2})`);
      }
      if (typeof linkMarks !== 'undefined' && linkMarks) {
        linkMarks.transition().duration(duration).
          attr('x1', d => d.source.x ).attr('y1', d => d.source.y).
          attr('x2', d => d.target.x ).attr('y2', d => d.target.y);
      }
    }
    const node =
      ngroup.selectAll('.node').
        data(nodes).enter().
          append('g').
          classed('node', true).
          classed(style.node, true).
          attr('r', 5).
          call(d3cola.drag);
    node.append('title').text(d => d.name);
    const suse =
      node.append('svg').
        attr('width', model.glyphSize).
        attr('height', model.glyphSize).
        attr('fill', vinfo => getLegend(vinfo.name).color).
          append('use').
            attr('xlink:href', vinfo => getLegend(vinfo.name).shape);
    console.log('Nodes ', node);
    d3cola.on('tick', () => updatePositions(node, linkSelection, 0.01));
    changeEdgeCutoff(model.edgeSlider);
  };

  /*
  function handleHoverUpdate(data) {
    const svg = d3.select(model.container);
    Object.keys(data.state).forEach((pName) => {
      const binList = data.state[pName];
      svg.selectAll(`g.group[param-name='${pName}'] > path.htile`)
        .classed('hilite', (d, i) =>
          binList.indexOf(-1) === -1 && binList.indexOf(i) >= 0
        );
    });
  }
  */

  // Make sure default values get applied
  publicAPI.setContainer(model.container);

  model.subscriptions.push({ unsubscribe: publicAPI.setContainer });
  model.subscriptions.push(model.provider.onFieldChange(() => {
    /* Handle incremental changes to list of variables? */
    if (model.provider.setMutualInformationParameterNames) {
      model.provider.setMutualInformationParameterNames(model.provider.getFieldNames()); // .getActiveFieldNames());
    }
  }));

  if (model.provider.isA('Histogram1DProvider')) {
    model.histogram1DDataSubscription = model.provider.subscribeToHistogram1D(
      (data) => {
        model.histogramData = data;
        publicAPI.render();
      },
      model.provider.getFieldNames(),
      {
        numberOfBins: model.numberOfBins,
        partial: false,
      }
    );

    model.subscriptions.push(model.histogram1DDataSubscription);
  }

  if (model.provider.isA('MutualInformationProvider')) {
    model.mutualInformationDataSubscription = model.provider.onMutualInformationReady(
      (data) => {
        model.mutualInformationData = data;
        publicAPI.render();
      });

    model.subscriptions.push(model.mutualInformationDataSubscription);
    model.provider.setMutualInformationParameterNames(model.provider.getFieldNames()); // .getActiveFieldNames());
  }

  /*
  if (model.provider.isA('HistogramBinHoverProvider')) {
    model.subscriptions.push(model.provider.onHoverBinChange(handleHoverUpdate));
  }

  if (model.provider.isA('SelectionProvider')) {
    model.subscriptions.push(model.provider.onAnnotationChange((annotation) => {
      if (lastAnnotationPushed
        && annotation.selection.type === 'range'
        && annotation.id === lastAnnotationPushed.id
        && annotation.generation === lastAnnotationPushed.generation + 1) {
        // Assume that it is still ours but edited by someone else
        lastAnnotationPushed = annotation;
        // Capture the score and update our default
        model.defaultScore = lastAnnotationPushed.score[0];
      }
    }));
  }
  */
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  container: null,
  provider: null,

  needData: true,

  glyphSize: 15,

  statusBarVisible: false,

  useAnnotation: false,
  defaultScore: 0,
  defaultWeight: 1,

  numberOfBins: 32,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  CompositeClosureHelper.destroy(publicAPI, model);
  CompositeClosureHelper.isA(publicAPI, model, 'VizComponent');
  CompositeClosureHelper.get(publicAPI, model, ['provider', 'container', 'numberOfBins']);
  CompositeClosureHelper.set(publicAPI, model, ['numberOfBins']);
  CompositeClosureHelper.dynamicArray(publicAPI, model, 'readOnlyFields');

  informationGraph(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = CompositeClosureHelper.newInstance(extend);

// ----------------------------------------------------------------------------

export default { newInstance, extend };