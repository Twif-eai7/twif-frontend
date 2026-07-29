import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

async function fetchCategoryPath(leafId) {
  const path = []
  let currentId = leafId
  while (currentId) {
    const { data } = await supabase.from('categories').select('id, name, parent_id').eq('id', currentId).single()
    if (!data) break
    path.unshift(data)
    currentId = data.parent_id
  }
  if (!path.length) return { levels: [], selections: [] }

  const levels = []
  for (let i = 0; i < path.length; i++) {
    const { data: opts } = i === 0
      ? await supabase.from('categories').select('id, name').eq('level', 1).order('name')
      : await supabase.from('categories').select('id, name').eq('parent_id', path[i - 1].id).order('name')
    levels.push(opts || [])
  }

  const { data: children } = await supabase.from('categories').select('id, name').eq('parent_id', leafId).order('name')
  if (children?.length) levels.push(children)

  return { levels, selections: path.map(n => ({ id: n.id, name: n.name })) }
}

export function useCategorySelect(initialCategoryId) {
  const [categoryLevels,     setCategoryLevels]     = useState([])
  const [categorySelections, setCategorySelections] = useState([])
  const [catLoading,         setCatLoading]         = useState(true)

  useEffect(() => {
    setCatLoading(true)
    if (initialCategoryId) {
      fetchCategoryPath(initialCategoryId)
        .then(({ levels, selections }) => {
          setCategoryLevels(levels)
          setCategorySelections(selections)
        })
        .catch(() => {})
        .finally(() => setCatLoading(false))
    } else {
      supabase.from('categories').select('id, name').eq('level', 1).order('name')
        .then(({ data }) => setCategoryLevels(data?.length ? [data] : []))
        .catch(() => {})
        .finally(() => setCatLoading(false))
    }
  }, [initialCategoryId])

  const handleCategorySelect = async (levelIndex, id, name) => {
    const newSelections = [...categorySelections.slice(0, levelIndex)]
    const newLevels     = [...categoryLevels.slice(0, levelIndex + 1)]

    if (!id) {
      setCategorySelections(newSelections)
      setCategoryLevels(newLevels)
      return
    }

    newSelections[levelIndex] = { id, name }
    setCategorySelections(newSelections)

    const { data: children } = await supabase
      .from('categories')
      .select('id, name')
      .eq('parent_id', id)
      .order('name')

    if (children?.length) newLevels.push(children)
    setCategoryLevels(newLevels)
  }

  const deepestCategory = categorySelections.length
    ? categorySelections[categorySelections.length - 1]
    : null

  return { categoryLevels, categorySelections, catLoading, handleCategorySelect, deepestCategory }
}
