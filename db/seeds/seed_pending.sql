-- db/seeds/seed_pending.sql
-- Semilla LIWA: 1 org demo, 2 líneas, 6 máquinas, 9 turnos, producción y ~200 eventos.
-- Admins: Marti y Adriana

DO $$
DECLARE
  v_org uuid;
  r RECORD;
  m RECORD;
  turn_minutes int;
  p_count int;    -- paros por turno/máquina
  p_dur   int;    -- duración de cada paro (min)
  p_from  timestamptz;
  p_to    timestamptz;
  ideal_cycle_ms int;
  target_cpm numeric;
  eff numeric;
  minutes_ok int;
  good_units int;
  bad_units int;
BEGIN
  -- 0) Crear/obtener la organización demo
  INSERT INTO orgs(name) VALUES ('TecnoFab Demo')
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_org FROM orgs WHERE name='TecnoFab Demo';

  -- 0.1) Agregar a Marti y Adriana como admins
  BEGIN
    INSERT INTO org_members (org_id, user_id, role)
    VALUES 
      (v_org, '4ca395e8-3502-406a-be30-353f7d5c3e2d', 'admin'), -- Marti
      (v_org, '2a7a5f90-f44d-409c-9aa3-25a04065b40e', 'admin'); -- Adriana
  EXCEPTION WHEN others THEN
    NULL; -- si ya existen, no hacer nada
  END;

  -- 1) Limpieza previa de datos de esta org (para re-sembrar sin duplicar)
  DELETE FROM events       WHERE org_id = v_org;
  DELETE FROM production   WHERE org_id = v_org;
  DELETE FROM machines     WHERE org_id = v_org;
  DELETE FROM lines        WHERE org_id = v_org;
  DELETE FROM org_members  WHERE org_id = v_org 
    AND user_id NOT IN ('4ca395e8-3502-406a-be30-353f7d5c3e2d','2a7a5f90-f44d-409c-9aa3-25a04065b40e');

  -- 2) Líneas
  INSERT INTO lines (org_id, code, name) VALUES
    (v_org, 'L1', 'Línea 1'),
    (v_org, 'L2', 'Línea 2')
  ON CONFLICT (org_id, code) DO NOTHING;

-- 3) Máquinas (3 por línea)  ✅ alias mx para no chocar con la variable m RECORD
INSERT INTO machines (org_id, line_id, code, name, ideal_cycle_ms)
SELECT v_org, l.id, mx.code, mx.name, mx.ideal_cycle_ms
FROM lines l
JOIN (
  VALUES
    ('L1','L1-M1','Mezcladora', 1200),
    ('L1','L1-M2','Laminador', 1000),
    ('L1','L1-M3','Freidora',   900),
    ('L2','L2-M1','Mezcladora', 1100),
    ('L2','L2-M2','Cortador',    950),
    ('L2','L2-M3','Empaquetado', 800)
) AS mx(line_code, code, name, ideal_cycle_ms)
  ON l.code = mx.line_code AND l.org_id = v_org
ON CONFLICT (org_id, code) DO NOTHING;

  -- 4) Turnos (últimos 3 días × 3 turnos: Mañana 06-14, Tarde 14-22, Noche 22-06)
  WITH days AS (
    SELECT generate_series(date_trunc('day', now())::date - interval '2 day',
                           date_trunc('day', now())::date, interval '1 day')::date AS d
  ),
  tpl AS (
    SELECT 1 AS shift_no, time '06:00' AS start_t, time '14:00' AS end_t UNION ALL
    SELECT 2, time '14:00', time '22:00' UNION ALL
    SELECT 3, time '22:00', time '06:00'
  ),
  ins AS (
    SELECT
      (d + start_t)::timestamptz                 AS starts_at,
      CASE WHEN shift_no=3 THEN (d + interval '1 day' + end_t)::timestamptz
           ELSE (d + end_t)::timestamptz END     AS ends_at,
      shift_no
    FROM days CROSS JOIN tpl
  )
  INSERT INTO shifts (org_id, code, name, starts_at, ends_at)
  SELECT v_org,
         concat('S', to_char(starts_at, 'YYYYMMDDHH24MI')) AS code,
         CASE shift_no WHEN 1 THEN 'Mañana' WHEN 2 THEN 'Tarde' ELSE 'Noche' END AS name,
         starts_at, ends_at
  FROM ins
  ON CONFLICT (org_id, code) DO NOTHING;

  -- 5) Catálogo mínimo de paros (si no existe)
  INSERT INTO downtime_taxonomy (org_id, lvl1, lvl2, lvl3, requires_lvl3) VALUES
    (v_org,'Fallo','Fallo sistema aceite', NULL, FALSE),
    (v_org,'Ajuste','Corte',               NULL, FALSE),
    (v_org,'Avería','Freidora',            NULL, FALSE),
    (v_org,'Sin Clasificar', NULL,         NULL, FALSE)
  ON CONFLICT DO NOTHING;

  -- Semilla pseudoaleatoria estable
  PERFORM setseed(0.42);

  -- 6) Para cada turno × máquina: producción + 2-4 paros
  FOR r IN
    SELECT id, starts_at, ends_at
    FROM shifts
    WHERE org_id = v_org
  LOOP
    turn_minutes := GREATEST(1, (EXTRACT(epoch FROM (r.ends_at - r.starts_at))/60)::int);

  FOR m IN
  SELECT id, machines.ideal_cycle_ms
  FROM machines
  WHERE org_id = v_org
LOOP
  ideal_cycle_ms := COALESCE(m.ideal_cycle_ms, 1000);
      target_cpm := 60000.0 / ideal_cycle_ms;        -- ciclos/min ideal
      eff := 0.85 + random()*0.10;                   -- 85%-95%
      minutes_ok := turn_minutes - (10 + (random()*20)::int);
      IF minutes_ok < 1 THEN minutes_ok := turn_minutes; END IF;

      good_units := GREATEST(0, (target_cpm * eff * minutes_ok)::int);
      bad_units  := (good_units * (0.01 + random()*0.03))::int; -- 1-4% scrap

      INSERT INTO production (org_id, machine_id, shift_id, good_units, bad_units, recorded_at)
      VALUES (v_org, m.id, r.id, good_units, bad_units, r.starts_at + interval '5 min');

      -- Paros: 2-4 por turno/máquina
      p_count := 2 + (random()*2)::int;
      FOR i IN 1..p_count LOOP
        p_dur  := 5 + (random()*20)::int;  -- 5-25 min
        p_from := r.starts_at + (random()*(turn_minutes-5))::int * interval '1 min';
        p_to   := p_from + p_dur * interval '1 min';

        -- Algunas causas clasificadas y otras sin clasificar
        CASE (1 + (random()*4)::int)
          WHEN 1 THEN
            INSERT INTO events (org_id, machine_id, shift_id, started_at, ended_at, lvl1, lvl2, lvl3, classified)
            VALUES (v_org, m.id, r.id, p_from, p_to, 'Fallo', 'Fallo sistema aceite', NULL, TRUE);
          WHEN 2 THEN
            INSERT INTO events (org_id, machine_id, shift_id, started_at, ended_at, lvl1, lvl2, lvl3, classified)
            VALUES (v_org, m.id, r.id, p_from, p_to, 'Ajuste', 'Corte', NULL, TRUE);
          WHEN 3 THEN
            INSERT INTO events (org_id, machine_id, shift_id, started_at, ended_at, lvl1, lvl2, lvl3, classified)
            VALUES (v_org, m.id, r.id, p_from, p_to, 'Avería', 'Freidora', NULL, TRUE);
          ELSE
            INSERT INTO events (org_id, machine_id, shift_id, started_at, ended_at, lvl1, lvl2, lvl3, classified)
            VALUES (v_org, m.id, r.id, p_from, p_to, 'Sin Clasificar', NULL, NULL, FALSE);
        END CASE;
      END LOOP;
    END LOOP;
  END LOOP;
END$$;
