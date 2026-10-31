'use client';

import React, { useEffect, useState } from 'react';
import { CountrySelect } from './CountrySelect';
import { Field, TextInput } from './primitives';
import { Select } from './select';

type Geo = typeof import('country-state-city');

/** The state/city catalogue is large, so it loads only when an address form opens. */
function useGeo(): Geo | null {
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => {
    let live = true;
    void import('country-state-city').then((mod) => live && setGeo(mod));
    return () => {
      live = false;
    };
  }, []);
  return geo;
}

export interface AddressValue {
  /** ISO 3166-1 alpha-2. */
  country: string;
  region: string;
  city: string;
  postcode: string;
}

/**
 * Country → region/state → city → postcode. Regions and cities come from a list for the
 * chosen country; when a place isn't listed, typing it and choosing “Use …” keeps it.
 */
export function AddressFields({
  idPrefix,
  value,
  onChange,
  errors = {},
}: {
  idPrefix: string;
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  errors?: Partial<Record<keyof AddressValue, string | undefined>>;
}) {
  const geo = useGeo();
  const states = geo && value.country ? geo.State.getStatesOfCountry(value.country) : [];
  const stateCode = states.find((s) => s.name === value.region)?.isoCode;
  const cities = !geo || !value.country
    ? []
    : stateCode
      ? geo.City.getCitiesOfState(value.country, stateCode)
      : states.length === 0
        ? (geo.City.getCitiesOfCountry(value.country) ?? [])
        : [];
  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

  return (
    <>
      <Field label="Country" htmlFor={`${idPrefix}-country`} error={errors.country}>
        <CountrySelect
          id={`${idPrefix}-country`}
          value={value.country}
          placeholder="Choose a country…"
          onChange={(country) => set({ country, region: '', city: '' })}
        />
      </Field>
      <Field label="Region / state" htmlFor={`${idPrefix}-region`} error={errors.region}>
        <Select
          id={`${idPrefix}-region`}
          value={value.region}
          disabled={!value.country}
          searchable
          allowCustom
          onChange={(e) => set({ region: e.target.value, city: '' })}
        >
          <option value="">{!value.country ? 'Choose a country first' : geo ? 'Select or type a region' : 'Loading regions…'}</option>
          {states.map((s) => (
            <option key={s.isoCode} value={s.name}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="City" htmlFor={`${idPrefix}-city`} error={errors.city}>
        <Select
          id={`${idPrefix}-city`}
          value={value.city}
          disabled={!value.country}
          searchable
          allowCustom
          noOptionsText="Type the city and choose “Use …”"
          onChange={(e) => set({ city: e.target.value })}
        >
          <option value="">{!value.country ? 'Choose a country first' : 'Select or type a city'}</option>
          {cities.map((c) => (
            <option key={`${c.name}-${c.latitude}`} value={c.name}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Postcode" htmlFor={`${idPrefix}-postcode`} error={errors.postcode}>
        <TextInput
          id={`${idPrefix}-postcode`}
          value={value.postcode}
          maxLength={20}
          autoComplete="postal-code"
          onChange={(e) => set({ postcode: e.target.value })}
        />
      </Field>
    </>
  );
}
