// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

"use strict"

import("glean-wasm").then(Glean => {
    const {
        buildChart,
        setInputValueFromSearchParam,
        setURLSearchParam,
        searchParams,
        fillUpTextareaWithDummyData
    } = require("./distributions")

    const distType = document.getElementById("dist-type");
    if (distType) {
        const unitSelect = document.querySelector("#histogram-props select#unit")
        if (unitSelect) {
            setInputValueFromSearchParam(unitSelect);
            unitSelect.addEventListener("change", event => {
                let input = event.target;
                setURLSearchParam(input.name, input.value);
                buildChartFromInputs();
            });
        }

        // Open custom data modal when custom data option is selected
        const customDataInput = document.getElementById("custom-data-input-group");
        customDataInput.addEventListener('click', () => {
            customDataModalOverlay.style.display = "block";
            const customDataTextarea = document.querySelector("#custom-data-modal textarea");
            if (!customDataTextarea.value) fillUpTextareaWithDummyData(customDataTextarea);
        })

        // Rebuild chart everytime the custom data text is changed
        const customDataTextarea = document.querySelector("#custom-data-modal textarea");
        customDataTextarea.addEventListener("change", () => buildChartFromInputs());

        // Close modal when we click the overlay
        const customDataModalOverlay = document.getElementById("custom-data-modal-overlay");
        customDataModalOverlay && customDataModalOverlay.addEventListener('click', () => {
            customDataModalOverlay.style.display = "none";
        });
    
        // We need to stop propagation for click events on the actual modal,
        // so that clicking it doesn't close it
        const customDataModal = document.getElementById("custom-data-modal");
        customDataModal.addEventListener("click", event => event.stopPropagation());

        const options = document.querySelectorAll("#data-options input");
        options.forEach(option => {
            option.addEventListener("change", event => {
                event.preventDefault();
    
                let input = event.target;
                setURLSearchParam(input.name, input.value);
                buildChartFromInputs();
            });

            if (searchParams().get(option.name) == option.value) {
                option.checked = true;
    
                // We won't save the custom data in the URL,
                // if that is the value on load, we create dummy data
                if (option.value == "custom") {
                    const customDataTextarea = document.querySelector("#custom-data-modal textarea");
                    fillUpTextareaWithDummyData(customDataTextarea);
                }
            }
        });

        const inputs = [
            ...document.querySelectorAll("#histogram-props input"),
            document.querySelector("#histogram-props select#kind")
        ];

        inputs.forEach(input => {
            setInputValueFromSearchParam(input);
            input.addEventListener("change", event => {
                let input = event.target;
                setURLSearchParam(input.name, input.value);
                buildChartFromInputs();
            });
        });

        buildChartFromInputs();

        /**
         * Build and replace the previous chart with a new one, based on the page inputs.
         */
        function buildChartFromInputs() {
            const kind = document.getElementById("kind").value

            let props;
            if (kind == "functional") {
                const unit = document.querySelector("#histogram-props select#unit").value;
                props = {
                    unit,
                }
            } else {
                const lowerBound = Number(document.getElementById("lower-bound").value);
                const upperBound = Number(document.getElementById("upper-bound").value);
                const bucketCount = Number(document.getElementById("bucket-count").value);
                props = {
                    lowerBound,
                    upperBound,
                    bucketCount
                }
            }

            let distType = document.getElementById("dist-type").textContent;
            buildChart(
                Glean,
                distType.toLowerCase().split(" ")[0],
                kind,
                props,
                document.querySelector("#data-options input:checked").value,
                document.querySelector("#custom-data-modal textarea").value,
                document.getElementById("histogram-chart-legend"),
                document.getElementById("histogram-chart")
            )
        }
    }
})

