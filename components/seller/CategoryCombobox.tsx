"use client";

import React, { useState, useRef, useEffect, useId } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface CategoryOption {
  id: string;
  name: string;
}

interface CategoryComboboxProps {
  categories: CategoryOption[];
  value: string;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  error?: string | null;
  className?: string;
}

export function CategoryCombobox({
  categories,
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = "Search or select a category...",
  error,
  className = "",
}: CategoryComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selectedCategory = categories.find((c) => c.id === value);

  // Filter categories based on search query
  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  // Close combobox when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll<HTMLLIElement>("[role='option']");
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (category: CategoryOption) => {
    onChange(category.id);
    setSearchQuery("");
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearchQuery("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredCategories.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCategories.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredCategories.length) {
          handleSelect(filteredCategories[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery("");
        setHighlightedIndex(-1);
        break;
      case "Tab":
        setIsOpen(false);
        setSearchQuery("");
        setHighlightedIndex(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input ensuring standard form validation & FormData extraction */}
      <input
        type="hidden"
        name="category_id"
        id="category_id"
        value={value}
        required={required}
      />

      {/* Combobox Trigger / Search Input */}
      <div
        className={`relative flex items-center w-full rounded-md border bg-white transition-all sm:text-sm ${
          disabled
            ? "bg-slate-100 cursor-not-allowed opacity-60 border-slate-200"
            : isOpen
            ? "border-blue-500 ring-2 ring-blue-500/20"
            : error
            ? "border-red-500"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <div className="pl-3 text-slate-400 pointer-events-none">
          <Search className="w-4 h-4" />
        </div>

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-disabled={disabled}
          disabled={disabled}
          value={isOpen ? searchQuery : selectedCategory ? selectedCategory.name : ""}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            if (!disabled) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={selectedCategory ? selectedCategory.name : placeholder}
          className="w-full py-2 pl-2 pr-16 bg-transparent text-slate-900 placeholder:text-slate-400 sm:text-sm focus:outline-none"
        />

        <div className="absolute right-2 flex items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear selected category"
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            aria-label="Toggle category options"
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) {
                setIsOpen((prev) => !prev);
                inputRef.current?.focus();
              }
            }}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isOpen ? "rotate-180 text-blue-600" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Dropdown Options Listbox */}
      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 duration-100">
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            aria-label="Product Categories"
            className="focus:outline-none"
          >
            {filteredCategories.length > 0 ? (
              filteredCategories.map((category, index) => {
                const isSelected = category.id === value;
                const isHighlighted = index === highlightedIndex;

                return (
                  <li
                    key={category.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(category)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex items-center justify-between px-3.5 py-2 text-sm cursor-pointer select-none transition-colors ${
                      isHighlighted
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : isSelected
                        ? "bg-blue-50/50 text-blue-900 font-semibold"
                        : "text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">{category.name}</span>
                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />
                    )}
                  </li>
                );
              })
            ) : (
              <li
                role="presentation"
                className="px-3.5 py-3 text-sm text-center text-slate-500 italic"
              >
                No categories found
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
