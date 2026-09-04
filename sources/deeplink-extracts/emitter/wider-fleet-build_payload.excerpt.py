# PROVENANCE
# source_repo: pipelinenews
# source_path: tools/intelligence/cartridges/wider-fleet/build_payload.py
# head_sha (pipelinenews): bab117e4bff007939a9230079788b8643c650a4e
# lines: 155-172 (the 'row["t"]' technology-bucket field the wider-fleet emitter
# above reads as its 'technology' query parameter)
#
        if raw in SPINE_TYPES:
            continue
        coordinates = (feature.get("geometry") or {}).get("coordinates") or []
        if len(coordinates) < 2:
            skipped += 1
            continue

        match, reason = (resolve(index, props) if index else (None, "no csv supplied"))
        how[reason] += 1

        row = {
            "n": props.get("name") or "",
            "o": props.get("operator") or "",
            "t": props.get("tech") or "other",
            "rt": raw,
            "s": props.get("status") or "",
            "c": megawatts(props.get("capacity")) or 0.0,
            "ll": [round(float(coordinates[0]), 5), round(float(coordinates[1]), 5)],
