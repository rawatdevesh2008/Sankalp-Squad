// ==============================================================================
// AWS CEDAR POLICY DEFINITIONS: INDIAN MUNICIPAL SOLID WASTE (SWM 2016)
// AND CENTRAL POLLUTION CONTROL BOARD (CPCB) E-WASTE RULES 2022/2024
// ==============================================================================

// ------------------------------------------------------------------------------
// Policy 1: Dry Recyclables in Blue Bin (MoEFCC SWM Rules 2016, Rule 15)
// Permit clean dry recyclables (paper, cardboard, plastics, metal cans).
// ------------------------------------------------------------------------------
@id("policy_swm_blue_bin_permit")
permit (
    principal,
    action == Action::"Dispose",
    resource == Bin::"Blue_Dry_Recyclable"
) when {
    context.is_clean == true &&
    context.is_contaminated == false &&
    context.category in ["Dry Recyclable", "Paper", "Cardboard", "Recyclable Plastic", "PET"]
};

// ------------------------------------------------------------------------------
// Policy 2: Food Grease & Soiled Paper Prohibition (MoEFCC SWM 2016, Rule 15(c))
// Strictly forbid food-soiled, greasy cardboard/paper from Blue Bin pulpers.
// ------------------------------------------------------------------------------
@id("policy_swm_grease_contamination_forbid")
forbid (
    principal,
    action == Action::"Dispose",
    resource == Bin::"Blue_Dry_Recyclable"
) when {
    context.is_greasy == true ||
    context.is_contaminated == true ||
    context.category in ["Sanitary / Landfill", "Soiled Paper"]
};

// ------------------------------------------------------------------------------
// Policy 3: Wet Organic Compostable in Green Bin (SWM Rules 2016, Rule 15(a))
// Permit organic peels, kitchen scraps, compostable biomatter in Green Bin.
// ------------------------------------------------------------------------------
@id("policy_swm_green_bin_permit")
permit (
    principal,
    action == Action::"Dispose",
    resource == Bin::"Green_Wet_Organic"
) when {
    context.is_contaminated == false &&
    context.category in ["Wet Organic", "Organic Biomass", "Compostable Food"]
};

// ------------------------------------------------------------------------------
// Policy 4: Plastic Bags in Green Bin Prohibition (SWM 2016, Rule 15(b))
// Forbid non-biodegradable plastics from organic compost bins.
// ------------------------------------------------------------------------------
@id("policy_swm_plastic_in_green_forbid")
forbid (
    principal,
    action == Action::"Dispose",
    resource == Bin::"Green_Wet_Organic"
) when {
    context.category in ["Recyclable Plastic", "Dry Recyclable", "Plastic Pouch", "Sanitary"]
};

// ------------------------------------------------------------------------------
// Policy 5: Hazardous E-Waste & Lithium-Ion Ban (CPCB E-Waste Rules 2022, Sched I)
// Lithium batteries, chargers, mobile devices are FORBIDDEN from municipal bins.
// Mandatory redirection to authorized Producer Take-Back / E-Waste collection kiosks.
// ------------------------------------------------------------------------------
@id("policy_cpcb_ewaste_hazard_ban")
forbid (
    principal,
    action == Action::"Dispose",
    resource in [Bin::"Blue_Dry_Recyclable", Bin::"Green_Wet_Organic", Bin::"Black_Landfill"]
) when {
    context.is_e_waste == true ||
    context.category in ["E-Waste", "E-Waste / Hazardous", "E-Waste / Hazardous Electronics", "Hazardous"]
};

// ------------------------------------------------------------------------------
// Policy 6: Sanitary & Inert Rejects in Black Bin (SWM 2016, Rule 15(d))
// Permit non-recoverable sanitary or landfill-bound reject in Black Bin.
// ------------------------------------------------------------------------------
@id("policy_swm_black_bin_permit")
permit (
    principal,
    action == Action::"Dispose",
    resource == Bin::"Black_Landfill"
) when {
    context.is_e_waste == false
};
