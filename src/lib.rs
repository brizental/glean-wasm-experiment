// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use std::convert::TryFrom;

mod error;
mod histogram;
mod units;
mod util;

use crate::histogram::{Bucketing, Histogram, HistogramType};
use crate::units::{MemoryUnit, TimeUnit};

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn accumulate_samples_custom_distribution(
    range_min: u32,
    range_max: u32,
    bucket_count: usize,
    histogram_type: i32,
    samples: Vec<u64>,
) -> String {
    fn accumulate<B: Bucketing>(samples: &[u64], mut hist: Histogram<B>) -> Histogram<B> {
        for &sample in samples.iter() {
            hist.accumulate(sample);
        }
        hist
    }

    let range_min = range_min as u64;
    let range_max = range_max as u64;
    match HistogramType::try_from(histogram_type).expect("Invalid value for histogram_type!") {
        HistogramType::Linear => {
            let mut hist = Histogram::linear(range_min, range_max, bucket_count);
            hist = accumulate(&samples, hist);
            serde_json::to_string(&hist.snapshot_values()).unwrap()
        }
        HistogramType::Exponential => {
            let mut hist = Histogram::exponential(range_min, range_max, bucket_count as usize);
            hist = accumulate(&samples, hist);
            serde_json::to_string(&hist.snapshot_values()).unwrap()
        }
    }
}

#[wasm_bindgen]
pub fn accumulate_samples_timing_distribution(time_unit: i32, samples: Vec<u64>) -> String {
    // The base of the logarithm used to determine bucketing
    const LOG_BASE: f64 = 2.0;

    // The buckets per each order of magnitude of the logarithm.
    const BUCKETS_PER_MAGNITUDE: f64 = 8.0;

    // Maximum time, which means we retain a maximum of 316 buckets.
    // It is automatically adjusted based on the `time_unit` parameter
    // so that:
    //
    // - `nanosecond` - 10 minutes
    // - `microsecond` - ~6.94 days
    // - `millisecond` - ~19 years
    const MAX_SAMPLE_TIME: u64 = 1000 * 1000 * 1000 * 60 * 10;

    let mut hist = Histogram::functional(LOG_BASE, BUCKETS_PER_MAGNITUDE);
    for &sample in samples.iter() {
        // Check the range prior to converting the incoming unit to
        // nanoseconds, so we can compare against the constant
        // MAX_SAMPLE_TIME.
        let mut sample = sample as u64;
        if sample == 0 {
            sample = 1;
        } else if sample > MAX_SAMPLE_TIME {
            sample = MAX_SAMPLE_TIME;
        }

        sample = TimeUnit::try_from(time_unit)
            .expect("Invalid valid for time_unit!")
            .as_nanos(sample);
        hist.accumulate(sample as u64);
    }

    serde_json::to_string(&hist.snapshot()).unwrap()
}

#[wasm_bindgen]
pub fn accumulate_samples_memory_distribution(memory_unit: i32, samples: Vec<u64>) -> String {
    // The base of the logarithm used to determine bucketing
    const LOG_BASE: f64 = 2.0;

    // The buckets per each order of magnitude of the logarithm.
    const BUCKETS_PER_MAGNITUDE: f64 = 16.0;

    // Set a maximum recordable value of 1 terabyte so the buckets aren't
    // completely unbounded.
    const MAX_BYTES: u64 = 1 << 40;

    let mut hist = Histogram::functional(LOG_BASE, BUCKETS_PER_MAGNITUDE);
    for &sample in samples.iter() {
        let sample = sample as u64;
        let mut sample = MemoryUnit::try_from(memory_unit)
            .expect("Invalid valid for memory_unit!")
            .as_bytes(sample);
        if sample > MAX_BYTES {
            sample = MAX_BYTES;
        }

        hist.accumulate(sample);
    }

    serde_json::to_string(&hist.snapshot()).unwrap()
}
