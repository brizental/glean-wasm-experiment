// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

"use strict"

const Chart = require("chart.js");

// Do not show dataset legend for graph,
// defining this in the Chart options doesn't seem to work
Chart.defaults.global.legend = false;

const DATA_SAMPLE_COUNT = 20000;

/**
 * Build and replace the previous chart with a new one.
 *
 * @param {Object} Glean The current Glean instance
 * @param {String} distType The type of distribution to build 'timing', 'memory' or 'custom'
 * @param {String} kind The kind of histogram that should be build, possible values are "functional", "exponential" or "linear"
 * @param {Object} props The properties related to the given histogram, keys differ based in the kind
 * @param {String} dataOption The chosen way to build data, possible values are "normally-distributed", "log-normally-distributed", "uniformly-distributed" or "custom"
 * @param {String} customData In case `dataOption` is "custom", this should contain a String containing a JSON array of numbers
 * @param {HTMLElement} chartLegend The HTML element that should contain the text of the chart legend
 * @param {HTMLElement} chartSpace The HTML element that should contain the chart
 */
function buildChart (Glean, distType, kind, props, dataOption, customData, chartLegend, chartSpace) {
    const { buckets, data, percentages, mean } = buildData(Glean, distType, kind, props, dataOption, customData);

    if (distType !== "custom") {
        chartLegend.innerHTML = `
            Using these parameters, the maximum bucket is <b>${buckets[buckets.length - 1]}</b>.
            <br /><br />
            The mean of the recorded data is <b>${formatNumber(mean)}</b>.
        `;
    } else {
        chartLegend.innerHTML = `Using these parameters, the widest bucket's width is <b>${getWidestBucketWidth(buckets)}</b>.`;
    }

    // Clear chart for re-drawing,
    // here we need to re-create the whole canvas
    // otherwise we keep rebuilding the new graph on top of the previous
    // and that causes hover madness
    const canvas = document.createElement("canvas");
    chartSpace.innerHTML = "";
    chartSpace.appendChild(canvas);
    // Draw the chart
    const ctx = canvas.getContext("2d");
    new Chart(ctx, {
        type: "bar",
        data: {
            labels: buckets,
            datasets: [{
                barPercentage: .95,
                categoryPercentage: 1,
                backgroundColor: "rgba(76, 138, 196, 1)",
                hoverBackgroundColor: "rgba(0, 89, 171, 1)",
                data: percentages
            }],
        },
        options: {
            responsive: true,
            scales: {
                yAxes: [{
                    ticks: {
                        beginAtZero: true,
                        callback: value => `${value}%`
                    },
                    scaleLabel: {
                        display: true,
                        labelString: "Percentages of samples"
                    }
                }],
                xAxes: [{
                    ticks: {
                        autoSkip: false,
                        minRotation: 50,
                        maxRotation: 50,
                        beginAtZero: true,
                        callback: (value, index, values) => {
                            const interval = Math.floor(values.length / 25)
                            if (interval > 0 && index % interval != 0) {
                                return ""
                            } else {
                                return value
                            }
                        }
                    },
                    scaleLabel: {
                        display: true,
                        labelString: "Buckets"
                    }
                }]
            },
            tooltips: {
                mode: "index",
                callbacks: {
                    title: () => null,
                    label: item => {
                        const index = item.index
                        const lastIndex = percentages.length - 1
                        const percentage = percentages[index].toFixed(2)
                        const value = formatNumber(data[index])
                        if (kind == "functional") {
                            return index == lastIndex ? `${value} samples (${percentage}%) where sample value > ${buckets[lastIndex]} (overflow)`
                                : `${value} samples (${percentage}%) where ${buckets[index]} ≤ sample value < ${buckets[index + 1]}`
                        } else {
                            return index == 0 ? `${value} samples (${percentage}%) where sample value < ${buckets[0]} (underflow)`
                                : index == lastIndex ? `${value} samples (${percentage}%) where sample value > ${buckets[lastIndex]} (overflow)`
                                : `${value} samples (${percentage}%) where ${buckets[index]} ≤ sample value < ${buckets[index + 1]}`
                        }
                    },
                }
            }
        }
    });
}

/**
 * Build the data to be rendered in the charts.
 *
 * @param {Object} Glean The current Glean instance
 * @param {String} distType The type of distribution to build 'timing', 'memory' or 'custom'
 * @param {String} kind The kind of histogram that should be build, possible values are "functional", "exponential" or "linear"
 * @param {Object} props The properties related to the given histogram, keys differ based in the kind
 * @param {String} dataOption The chosen way to build data, possible values are "normally-distributed", "log-normally-distributed", "uniformly-distributed" or "custom"
 * @param {String} customData In case `dataOption` is "custom", this should contain a String containing a JSON array of numbers
 *
 * @returns {Object} An object containing the bucket and values of a histogram
 */
function buildData (Glean, distType, kind, props, dataOption, customData) {
    if (distType == "memory" || distType == "timing") {
        return buildDataFunctional(Glean, distType, props, dataOption, customData);
    } else {
        return buildDataPreComputed(Glean, kind, props, dataOption, customData);
    }
}

/**
 * Build sample data or parse custom data.
 *
 * @param {String} dataOption The chosen way to build data, possible values are "normally-distributed", "log-normally-distributed", "uniformly-distributed" or "custom"
 * @param {String} customData In case `dataOption` is "custom", this should contain a String containing a JSON array of numbers
 * @param {Number} lower The lowest number the generated values may be, defaults to `1`
 * @param {Number} upper The highest number the generated values may be, defaults to `100`
 *
 * @returns {BigUint64Array} An array of values, this array has DATA_SAMPLE_COUNT length if not custom
 */
function buildSampleData (dataOption, customData, lower, upper) {
    if (!lower) lower = 1;
    if (!upper) upper = 100;
    const values =
        dataOption == "normally-distributed" ? normalRandomValues((lower + upper) / 2, (upper - lower) / 8, DATA_SAMPLE_COUNT)
        : dataOption == "log-normally-distributed" ? logNormalRandomValues(Math.sqrt(Math.max(lower, 1) * upper), Math.pow(upper / Math.max(lower, 1), 1 / 8), DATA_SAMPLE_COUNT)
        : dataOption == "uniformly-distributed" ? uniformValues(lower, upper, DATA_SAMPLE_COUNT)
        : parseJSONString(customData);

    let result = new BigUint64Array(DATA_SAMPLE_COUNT);
    values.forEach((value, index) => result[index] = BigInt(value))
    return result;
}

/**
 * Build the data to be rendered in the charts, in case histogram kind is "exponential" or "linear".
 *
 * @param {Object} Glean The current Glean instance
 * @param {String} kind The kind of histogram that should be build, possible values are "functional", "exponential" or "linear"
 * @param {Object} props The properties related to the given histogram, keys differ based in the kind
 * @param {String} dataOption The chosen way to build data, possible values are "normally-distributed", "log-normally-distributed", "uniformly-distributed" or "custom"
 * @param {String} customData In case `dataOption` is "custom", this should contain a String containing a JSON array of numbers
 *
 * @returns {Object} An object containing the bucket and values of a histogram
 */
function buildDataPreComputed (Glean, kind, props, dataOption, customData) {
    const { lowerBound, upperBound, bucketCount } = props;

    const values = buildSampleData(dataOption, customData, lowerBound, upperBound);

    const result = parseJSONString(
        Glean.accumulate_samples_custom_distribution(
            lowerBound,
            upperBound,
            bucketCount,
            Number(kind),
            values
        )
    );

    const data = Object.values(result);
    const buckets = Object.keys(result);

    return {
        data,
        buckets,
        percentages: data.map(v => v * 100 / values.length),
    };
}

/**
 * Build the data to be rendered in the charts, in case histogram kind is "functional".
 *
 * @param {Object} Glean The current Glean instance
 * @param {String} distType The type of distribution to build 'timing', 'memory' or 'custom'
 * @param {String} kind The kind of histogram that should be build, possible values are "functional", "exponential" or "linear"
 * @param {Object} props The properties related to the given histogram, keys differ based in the kind
 * @param {String} dataOption The chosen way to build data, possible values are "normally-distributed", "log-normally-distributed", "uniformly-distributed" or "custom"
 * @param {String} customData In case `dataOption` is "custom", this should contain a String containing a JSON array of numbers
 *
 * @returns {Object} An object containing the bucket and values of a histogram
 */
function buildDataFunctional(Glean, distType, props, dataOption, customData) {
    const { unit } = props;
    const values = buildSampleData(dataOption, customData);

    const acc = distType == "memory"
        ? Glean.accumulate_samples_memory_distribution
        : Glean.accumulate_samples_timing_distribution;
    const result = parseJSONString(
        acc(
            Number(unit),
            values
        )
    );

    const data = Object.values(result);
    const buckets = Object.keys(result);

    let sum = BigInt(0);
    for (const value of values) {
        sum += value;
    }
    const mean = sum / BigInt(values.length);

    return {
        data,
        buckets,
        percentages: data.map(v => v * 100 / values.length),
        mean,
    };
}

/**
 * Get the search params of the current URL.
 *
 * @returns {URLSearchParams} The search params object related to the current URL
 */
function searchParams() {
    return (new URL(document.location)).searchParams;
}

/**
 * Add a new param to the current pages URL, no relaoding
 *
 * @param {String} name The name of the param to set
 * @param {String} value The value of the param to set
 */
function setURLSearchParam(name, value) {
    let params = searchParams();
    params.set(name, value);
    history.pushState(null, null, `?${params.toString()}`);
}

/**
 * Attempts to get a search param in the current pages URL with the same name as a given input,
 * if such a param exists, set the value of the given input to the same value as the param found.
 *
 * @param {HTMLElement} input The input to update
 */
function setInputValueFromSearchParam(input) {
    let param = searchParams().get(input.name);
    if (param) input.value = param;
}

/**
 * Finds the widest bucket in a list of buckets.
 *
 * The width of a bucket is defined by it's minimum value minus the previous buckets minimum value.
 *
 * @param {Array} buckets An array of buckets
 *
 * @returns {Number} The length of the widest bucket found
 */
function getWidestBucketWidth (buckets) {
    let widest = 0;
    for (let i = 1; i < buckets.length; i++) {
        const currentWidth = buckets[i] - buckets[i - 1];
        if (currentWidth > widest) {
            widest = currentWidth;
        }
    }
    return widest;
}

/**
 * Attemps to parse a string as JSON, if unsuccesfull returns an empty array.
 *
 * @param {String} data A string containing a JSON encoded array
 *
 * @returns {Array} The parsed array
 */
function parseJSONString (data) {
    let result = [];
    try {
        result = JSON.parse(data);
    } finally {
        return result;
    }
}

/**
 * Fills up a given textarea with dummy data.
 *
 * @param {HTMLElement} textarea The textarea to fill up
 */
function fillUpTextareaWithDummyData (textarea) {
    const lower = 1;
    const upper = 100;
    const dummyData = logNormalRandomValues(Math.sqrt(Math.max(lower, 1) * upper), Math.pow(upper / Math.max(lower, 1), 1 / 8), DATA_SAMPLE_COUNT);
    const prettyDummyData = JSON.stringify(dummyData, undefined, 4);
    textarea.value = prettyDummyData;
}

/**
 * Box-Muller transform in polar form.
 *
 * Values below zero will be truncated to 0.
 *
 * Copied over and adapted
 * from https://github.com/mozilla/telemetry-dashboard/blob/bd7c213391d4118553b9ff1791ed0441bf912c60/histogram-simulator/simulator.js
 *
 * @param {Number} mu
 * @param {Number} sigma
 * @param {Number} count The length of the generated array
 *
 * @return {Array} An array of generated values
 */
function normalRandomValues (mu, sigma, count) {
    let values = [];
    let z0, z1, value;
    for (let i = 0; values.length < count; i++) {
        if (i % 2 === 0) {
            let x1, x2, w;
            do {
                x1 = 2 * Math.random() - 1;
                x2 = 2 * Math.random() - 1;
                w = x1 * x1 + x2 * x2;
            } while (w >= 1)
            w = Math.sqrt((-2 * Math.log(w)) / w);
            z0 = x1 * w;
            z1 = x2 * w;
            value = z0;
        } else {
            value = z1;
        }
        value = value * sigma + mu;

        values.push(value);
    }
    return values.map(value => value >= 0 ? Math.floor(value) : 0);
}

/**
 * Box-Muller transform in polar form for log-normal distributions
 *
 * Values below zero will be truncated to 0.
 *
 * Copied over and adapted
 * from https://github.com/mozilla/telemetry-dashboard/blob/bd7c213391d4118553b9ff1791ed0441bf912c60/histogram-simulator/simulator.js
 *
 * @param {Number} mu
 * @param {Number} sigma
 * @param {Number} count The length of the generated array
 *
 * @return {Array} An array of generated values
 */
function logNormalRandomValues (mu, sigma, count) {
    let values = [];
    let z0, z1, value;
    for (let i = 0; i < count; i++) {
        if (i % 2 === 0) {
            let x1, x2, w;
            do {
                x1 = 2 * Math.random() - 1;
                x2 = 2 * Math.random() - 1;
                w = x1 * x1 + x2 * x2;
            } while (w >= 1)
            w = Math.sqrt((-2 * Math.log(w)) / w);
            z0 = x1 * w;
            z1 = x2 * w;
            value = z0;
        } else {
            value = z1;
        }
        value = Math.exp(value * Math.log(sigma) + Math.log(mu));

        values.push(value);
    }
    return values.map(value => value >= 0 ? Math.floor(value) : 0);
}

/**
 * A uniformly distributed array of random values
 *
 * @param {Number} min The minimum value this function may generate
 * @param {Number} max The maximum value this function may generate
 * @param {Number} count The length of the generated array
 *
 * @return {Array} An array of generated values
 */
function uniformValues (min, max, count) {
    let values = [];
    for (var i = 0; i <= count; i++) {
        values.push(Math.random() * (max - min) + min);
    }

    return values;
}


/**
 * Formats a number as a string.
 *
 * Copied over and adapted
 * from https://github.com/mozilla/telemetry-dashboard/blob/bd7c213391d4118553b9ff1791ed0441bf912c60/histogram-simulator/simulator.js
 *
 * @param {Number} number The number to format
 *
 * @return {String} The formatted number
 */
function formatNumber(number) {
    // TODO: this is probably not very reliable.
    const n = Number(number);

    if (n == Infinity) return "Infinity";
    if (n == -Infinity) return "-Infinity";
    if (isNaN(n)) return "NaN";

    const mag = Math.abs(n);
    const exponent =
        Math.log10 !== undefined ? Math.floor(Math.log10(mag))
            : Math.floor(Math.log(mag) / Math.log(10));
    const interval = Math.pow(10, Math.floor(exponent / 3) * 3);
    const units = {
        1000: "k",
        1000000: "M",
        1000000000: "B",
        1000000000000: "T"
    };

    if (interval in units) {
        return Math.round(n * 100 / interval) / 100 + units[interval];
    }

    return Math.round(n * 100) / 100;
}

module.exports = {
    buildChart,
    fillUpTextareaWithDummyData,
    setURLSearchParam,
    setInputValueFromSearchParam,
    searchParams,
}
