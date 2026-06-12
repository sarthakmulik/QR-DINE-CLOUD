-- Migration: Add customizations JSONB column to hotels table for Elite whitelabeling
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS customizations JSONB DEFAULT '{
    "theme": "default",
    "primaryColor": "#ea580c",
    "secondaryColor": "#ffedd5",
    "textColor": "#ffffff",
    "fontFamily": "Inter",
    "announcementText": "",
    "welcomeMessage": "Welcome to our Restaurant"
  }'::jsonb;
