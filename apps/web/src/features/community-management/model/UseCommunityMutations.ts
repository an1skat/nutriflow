'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  addCommunitySchool,
  createCommunity,
  removeCommunitySchool,
  updateCommunity,
} from '@/entities/community/api/CommunityApi';
import { communityQueryKeys } from '@/entities/community/api/CommunityQueries';
import type {
  CreateCommunityPayload,
  UpdateCommunityPayload,
} from '@/entities/community/model/Community';
import { schoolQueryKeys } from '@/entities/school/api/SchoolQueries';

export function useCreateCommunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCommunityPayload) => createCommunity(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: communityQueryKeys.lists() }),
  });
}

export function useUpdateCommunity(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateCommunityPayload) => updateCommunity(communityId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: communityQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: schoolQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['protected', 'menu-requirements'] }),
      ]);
    },
  });
}

export function useAddCommunitySchool(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (schoolId: string) => addCommunitySchool(communityId, schoolId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: communityQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: communityQueryKeys.schoolOptions() }),
        queryClient.invalidateQueries({ queryKey: schoolQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['protected', 'menu-requirements'] }),
      ]);
    },
  });
}

export function useRemoveCommunitySchool(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (schoolId: string) => removeCommunitySchool(communityId, schoolId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: communityQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: communityQueryKeys.schoolOptions() }),
        queryClient.invalidateQueries({ queryKey: schoolQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['protected', 'menu-requirements'] }),
      ]);
    },
  });
}
