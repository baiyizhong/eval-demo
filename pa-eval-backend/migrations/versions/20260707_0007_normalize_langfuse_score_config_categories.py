"""normalize langfuse score config categories

Revision ID: 20260707_0007
Revises: 20260707_0006
Create Date: 2026-07-07 16:00:00.000000
"""

from alembic import op


revision = "20260707_0007"
down_revision = "20260707_0006"
branch_labels = None
depends_on = None


def _execute(sql: str) -> None:
    op.get_bind().exec_driver_sql(sql)


def upgrade() -> None:
    _execute(
        """
        UPDATE score_configs
        SET
            categories = NULL,
            updated_at = NOW()
        WHERE data_type::text IN ('NUMERIC', 'TEXT')
          AND categories IS NOT NULL
        """
    )
    _execute(
        """
        UPDATE score_configs
        SET
            categories = '[{"label":"True","value":1},{"label":"False","value":0}]'::jsonb,
            min_value = NULL,
            max_value = NULL,
            updated_at = NOW()
        WHERE data_type::text = 'BOOLEAN'
          AND categories IS DISTINCT FROM
              '[{"label":"True","value":1},{"label":"False","value":0}]'::jsonb
        """
    )
    _execute(
        """
        UPDATE score_configs
        SET
            min_value = NULL,
            max_value = NULL,
            categories = COALESCE(categories, '[]'::jsonb),
            updated_at = NOW()
        WHERE data_type::text = 'CATEGORICAL'
          AND (
              min_value IS NOT NULL
              OR max_value IS NOT NULL
              OR categories IS NULL
          )
        """
    )
    _execute(
        """
        UPDATE score_configs AS sc
        SET
            categories = converted.categories,
            updated_at = NOW()
        FROM (
            SELECT
                id,
                jsonb_agg(
                    jsonb_build_object(
                        'label',
                        CASE
                            WHEN jsonb_typeof(item.value) = 'object' THEN
                                NULLIF(item.value->>'label', '')
                            WHEN POSITION('|' IN item.value #>> '{}') > 0 THEN
                                NULLIF(SPLIT_PART(item.value #>> '{}', '|', 2), '')
                            ELSE
                                NULLIF(item.value #>> '{}', '')
                        END,
                        'value',
                        CASE
                            WHEN jsonb_typeof(item.value) = 'object'
                                 AND COALESCE(item.value->>'value', '') ~ '^-?\\d+(\\.\\d+)?$'
                                THEN (item.value->>'value')::double precision
                            WHEN jsonb_typeof(item.value) = 'string'
                                 AND SPLIT_PART(item.value #>> '{}', '|', 1) ~ '^-?\\d+(\\.\\d+)?$'
                                THEN SPLIT_PART(item.value #>> '{}', '|', 1)::double precision
                            ELSE
                                item.ordinality::double precision
                        END
                    )
                    ORDER BY item.ordinality
                ) AS categories
            FROM score_configs
            CROSS JOIN LATERAL jsonb_array_elements(categories) WITH ORDINALITY AS item(value, ordinality)
            WHERE data_type::text = 'CATEGORICAL'
              AND jsonb_typeof(categories) = 'array'
              AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(categories) AS existing(value)
                  WHERE jsonb_typeof(existing.value) <> 'object'
                     OR existing.value->>'label' IS NULL
                     OR COALESCE(existing.value->>'value', '') !~ '^-?\\d+(\\.\\d+)?$'
              )
            GROUP BY id
        ) AS converted
        WHERE sc.id = converted.id
        """
    )
    _execute(
        """
        UPDATE score_configs
        SET categories = (
            SELECT jsonb_agg(
                jsonb_set(
                    category.value,
                    '{label}',
                    to_jsonb(COALESCE(NULLIF(category.value->>'label', ''), category.value->>'value', category.ordinality::text))
                )
                ORDER BY category.ordinality
            )
            FROM jsonb_array_elements(categories) WITH ORDINALITY AS category(value, ordinality)
        )
        WHERE data_type::text = 'CATEGORICAL'
          AND jsonb_typeof(categories) = 'array'
          AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(categories) AS existing(value)
              WHERE COALESCE(existing.value->>'label', '') = ''
          )
        """
    )


def downgrade() -> None:
    # Keep Langfuse-compatible score config data on downgrade. Reintroducing the
    # previous invalid categories would make score configs disappear from Langfuse.
    pass
